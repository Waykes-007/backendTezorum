const axios    = require('axios')
const supabase = require('../config/supabase')

const SHARF_BASE_URL     = process.env.SHARF_BASE_URL
const SUB_KEY_SETTINGS  = process.env.SHARF_SUBSCRIPTION_KEY_SETTINGS
const SUB_KEY_SHIPMENTS = process.env.SHARF_SUBSCRIPTION_KEY_SHIPMENTS
const CLIENT_ID          = process.env.SHARF_CLIENT_ID

const sharfHeaders = () => ({
  'subscription-key': SUB_KEY_SHIPMENTS,
  'client-id':        CLIENT_ID,
  'Content-Type':     'application/json',
})

const SHARF_ESTADO_MAP = {
  '5423': 'en_ruta',
  '5678': 'en_ruta',
  '5679': 'entregado',
  '5680': 'no_entregado',
  '5681': 'en_ruta',
  '5682': 'no_recogido',
  '6000': 'devolucion',
}

async function crearEnvioSharf({ pedido, subpedidos, datosEntrega, almacen }) {
  try {
    const orderNumber = `WAY${String(pedido.numero_pedido ?? pedido.id).padStart(10, '0')}`

    const body = {
      orderNumber,
      serviceType: 0,
      shipperInformation: {
        companyName:           'Waykes',
        branchCode:            '0001',
        personName:            'Almacen Waykes',
        documentType:          '0004',
        documentNumber:        '20606370009',
        phoneNumber:           '+51 999999999',
        emailAddress:          'almacen@waykes.com',
        additionalPersonName:  '',
        additionalDocumentType: '',
        additionalDocumentNumber: '',
        additionalPhoneNumber: '',
        addressInformation: {
          addressLine: 'Av. Brasil 1258, Pueblo Libre, Lima',
          reference:   '',
          ubigeoCode:  '070101',
          geolocation: {
            latitude:  '-12.065584',
            longitude: '-77.006047',
          },
        },
      },
      recipientInformation: {
        companyName:           (datosEntrega.nombre ?? 'Cliente').slice(0, 100),
        branchCode:            '0002',
        personName:            (datosEntrega.nombre ?? 'Cliente').slice(0, 20),
        documentType:          '0003',
        documentNumber:        datosEntrega.dni ?? '00000000',
        phoneNumber:           `+51 ${(datosEntrega.whatsapp ?? '999999999').replace(/\s/g, '')}`,
        emailAddress:          datosEntrega.email ?? 'cliente@waykes.com',
        additionalPersonName:  '',
        additionalDocumentType: '',
        additionalDocumentNumber: '',
        additionalPhoneNumber: '',
        addressInformation: {
          addressLine: (datosEntrega.direccion ?? 'Lima, Peru').slice(0, 150),
          reference:   datosEntrega.referencia ?? '',
          ubigeoCode:  '150122',
          geolocation: {
            latitude:  '-12.065584',
            longitude: '-77.006047',
          },
        },
      },
      packages: {
        description:       'Productos Waykes',
        packagingType:     '0002',
        totalPackageCount: subpedidos.length,
        totalWeight:       parseFloat((subpedidos.length * 1.0).toFixed(2)),
        totalDimWeight:    0.0,
        additionalInformation: '',
      },
      items: subpedidos.map(s => ({
        itemCode:        s.codigo_subpedido?.slice(0, 25) ?? '001',
        itemDescription: `Subpedido ${s.codigo_subpedido}`.slice(0, 150),
        itemModel:       '',
        itemBrand:       '',
        itemQuantity:    1,
        weight:          1.0,
        width:           0,
        height:          0,
        length:          0,
      })),
    }

    console.log('📦 Sharf headers:', JSON.stringify(sharfHeaders()))
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

async function procesarWebhookSharf(payload) {
  const {
    trackingNumber,
    orderStatusCode,
    orderStatusDescription,
    orderSubStatusDescription,
  } = payload

  console.log(`📦 Webhook Sharf: ${trackingNumber} → ${orderStatusDescription}`)

  const estadoWaykes = SHARF_ESTADO_MAP[orderStatusCode] ?? 'en_ruta'

  await supabase.from('salidas_paquetes').update({
    sharf_status:      orderStatusCode,
    sharf_status_desc: orderStatusDescription,
  }).eq('tracking_number', trackingNumber)

  await supabase.from('subpedidos').update({
    estado:            estadoWaykes,
    sharf_status:      orderStatusCode,
    sharf_status_desc: `${orderStatusDescription}${orderSubStatusDescription ? ' - ' + orderSubStatusDescription : ''}`,
  }).eq('tracking_number', trackingNumber)

  if (orderStatusCode === '5679') {
    const { data: salida } = await supabase
      .from('salidas_paquetes').select('pedido_id')
      .eq('tracking_number', trackingNumber).single()
    if (salida?.pedido_id) {
      await supabase.from('pedidos')
        .update({ estado_pedido: 'entregado' }).eq('id', salida.pedido_id)
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