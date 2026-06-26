// src/services/sharfService.js
const axios   = require('axios')
const supabase = require('../config/supabase')

const SHARF_BASE_URL      = process.env.SHARF_BASE_URL
const SUB_KEY_SETTINGS   = process.env.SHARF_SUBSCRIPTION_KEY_SETTINGS
const SUB_KEY_SHIPMENTS  = process.env.SHARF_SUBSCRIPTION_KEY_SHIPMENTS
const CLIENT_ID           = process.env.SHARF_CLIENT_ID

// Headers para API Settings (webhook, status)
const sharfHeadersSettings = () => ({
  'subscription-key': SUB_KEY_SETTINGS,
  'client-id':        CLIENT_ID,
  'Content-Type':     'application/json',
})

// Headers para API Shipments (crear envío, tracking)
const sharfHeaders = () => ({
  'subscription-key': SUB_KEY_SHIPMENTS,
  'client-id':        CLIENT_ID,
  'Content-Type':     'application/json',
})

// ── Mapeo de estados Sharf → estados Waykes ───────────────────────────────────
const SHARF_ESTADO_MAP = {
  '5423': 'en_ruta',           // EMITIDO
  '5678': 'en_ruta',           // ASIGNADO A RUTA
  '5679': 'entregado',         // ENTREGADO
  '5680': 'no_entregado',      // NO ENTREGADO
  '5681': 'en_ruta',           // RECOGIDO
  '5682': 'no_recogido',       // NO RECOGIDO
  '6000': 'devolucion',        // DEVOLUCIÓN EFECTIVA
}

// ── 1. Crear envío en Sharf ───────────────────────────────────────────────────
async function crearEnvioSharf({ pedido, subpedidos, datosEntrega, almacen }) {
  try {
    const orderNumber = String(pedido.numero_pedido ?? pedido.id).slice(0, 25)

    const body = {
      orderNumber,
      serviceType: 0,
      shipperInformation: {
        companyName: 'Waykes',
        personName:  'Almacén Waykes',
        phoneNumber: '+51 999999999',
        emailAddress: 'almacen@waykes.com',
        addressInformation: {
          addressLine: almacen?.direccion ?? 'Av. Brasil 1258, Pueblo Libre, Lima',
          reference:   '',
          ubigeoCode:  almacen?.ubigeo ?? '150130', // Pueblo Libre
        },
      },
      recipientInformation: {
        companyName: datosEntrega.nombre ?? 'Cliente',
        personName:  datosEntrega.nombre?.slice(0, 20) ?? 'Cliente',
        documentType:   '0003',
        documentNumber: datosEntrega.dni ?? '00000000',
        phoneNumber:    `+51 ${datosEntrega.whatsapp}`,
        emailAddress:   datosEntrega.email ?? '',
        addressInformation: {
          addressLine: datosEntrega.direccion?.slice(0, 150),
          reference:   datosEntrega.referencia ?? '',
          ubigeoCode:  datosEntrega.ubigeo ?? '150101', // Lima
        },
      },
      packages: {
        description:       'Productos Waykes',
        packagingType:     '0002', // BOX
        totalPackageCount: subpedidos.length,
        totalWeight:       subpedidos.length * 1.0, // estimado 1kg por paquete
        additionalInformation: `Subpedidos: ${subpedidos.map(s => s.codigo_subpedido).join(', ')}`,
      },
      items: subpedidos.map(s => ({
        itemDescription: `Subpedido ${s.codigo_subpedido}`,
        itemQuantity:    1,
        weight:          1.0,
      })),
    }

    console.log('📦 Sharf body:', JSON.stringify(body, null, 2))

    const res = await axios.post(
      `${SHARF_BASE_URL}/shipments/v1/order`,
      body,
      { headers: sharfHeaders() }
    )

    const { trackingNumber, trackingURL } = res.data?.data ?? {}
    console.log(`✅ Sharf envío creado: ${trackingNumber}`)
    return { trackingNumber, trackingURL, orderNumber }
  } catch (err) {
    console.error('❌ Sharf crearEnvio:', JSON.stringify(err.response?.data ?? err.message))
    throw new Error(err.response?.data?.message ?? err.message)
  }
}

// ── 2. Consultar tracking por número de guía ──────────────────────────────────
async function consultarTracking(trackingNumber) {
  try {
    const res = await axios.get(
      `${SHARF_BASE_URL}/shipments/v1/tracking`,
      {
        params:  { TrackingNumber: trackingNumber, Events: 1 },
        headers: sharfHeaders(),
      }
    )
    return res.data?.data?.tracking ?? null
  } catch (err) {
    console.error('❌ Sharf consultarTracking:', err.response?.data ?? err.message)
    return null
  }
}

// ── 3. Consultar tracking por número de pedido ────────────────────────────────
async function consultarTrackingPorPedido(orderNumber) {
  try {
    const res = await axios.get(
      `${SHARF_BASE_URL}/shipments/v1/tracking/reference`,
      {
        params:  { OrderNumber: orderNumber, Events: 1 },
        headers: sharfHeaders(),
      }
    )
    return res.data?.data?.trackings?.[0] ?? null
  } catch (err) {
    console.error('❌ Sharf consultarTrackingPorPedido:', err.response?.data ?? err.message)
    return null
  }
}

// ── 4. Procesar webhook de Sharf ──────────────────────────────────────────────
async function procesarWebhookSharf(payload) {
  const {
    orderNumber,
    trackingNumber,
    orderStatusCode,
    orderStatusDescription,
    orderSubStatusCode,
    orderSubStatusDescription,
  } = payload

  console.log(`📦 Webhook Sharf: ${trackingNumber} → ${orderStatusDescription}`)

  const estadoWaykes = SHARF_ESTADO_MAP[orderStatusCode] ?? 'en_ruta'

  // Actualizar salida_paquetes con el nuevo estado
  const { error: salidaErr } = await supabase
    .from('salidas_paquetes')
    .update({
      sharf_status:      orderStatusCode,
      sharf_status_desc: orderStatusDescription,
    })
    .eq('tracking_number', trackingNumber)

  if (salidaErr) console.error('❌ Update salidas_paquetes:', salidaErr.message)

  // Actualizar subpedidos relacionados al pedido
  const { error: subErr } = await supabase
    .from('subpedidos')
    .update({
      estado:            estadoWaykes,
      sharf_status:      orderStatusCode,
      sharf_status_desc: `${orderStatusDescription}${orderSubStatusDescription ? ' - ' + orderSubStatusDescription : ''}`,
    })
    .eq('tracking_number', trackingNumber)

  if (subErr) console.error('❌ Update subpedidos:', subErr.message)

  // Si fue entregado, actualizar pedido principal también
  if (orderStatusCode === '5679') {
    // Buscar pedido_id desde salidas_paquetes
    const { data: salida } = await supabase
      .from('salidas_paquetes')
      .select('pedido_id')
      .eq('tracking_number', trackingNumber)
      .single()

    if (salida?.pedido_id) {
      await supabase.from('pedidos')
        .update({ estado_pedido: 'entregado' })
        .eq('id', salida.pedido_id)
    }
  }

  return { ok: true }
}

module.exports = {
  crearEnvioSharf,
  consultarTracking,
  consultarTrackingPorPedido,
  procesarWebhookSharf,
  SHARF_ESTADO_MAP,
}