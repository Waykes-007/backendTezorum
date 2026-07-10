// src/routes/sharfRoutes.js
const express  = require('express')
const router   = express.Router()
const supabase = require('../config/supabase')
const {
  crearEnvioSharf,
  consultarTracking,
  consultarTrackingPorPedido,
  procesarWebhookSharf,
} = require('../services/sharfService')
const { soloAdmin } = require('../middlewares/authMiddleware')

// ── POST /api/sharf/despacho/:salidaId ───────────────────────────────────────
// Crear envío en Sharf al momento de despachar
router.post(`/despacho/:salidaId`, async (req, res) => {
  const { salidaId } = req.params
  try {
    // Obtener datos de la salida
    const { data: salida, error: salidaErr } = await supabase
      .from('salidas_paquetes')
      .select('*, pedidos(id, numero_pedido, direccion_envio, nombre_destinatario, whatsapp_contacto)')
      .eq('id', salidaId)
      .single()

    if (salidaErr || !salida) return res.status(404).json({ error: 'Salida no encontrada' })
    if (salida.tracking_number) return res.status(400).json({ error: 'Esta salida ya tiene guía de Sharf' })
    
    console.log('📦 salida.pedidos:', JSON.stringify(salida.pedidos))

    // Obtener subpedidos de esta salida
    const { data: subpedidos } = await supabase
      .from('subpedidos')
      .select('id, codigo_subpedido, tienda_id')
      .eq('pedido_id', salida.pedido_id)
      .in('estado', ['consolidado', 'en_ruta'])

    if (!subpedidos?.length) return res.status(400).json({ error: 'No hay subpedidos consolidados para despachar' })

    const pedido       = salida.pedidos
    const datosEntrega = {
      nombre:    pedido.nombre_destinatario ?? 'Cliente',
      whatsapp:  pedido.whatsapp_contacto ?? '999999999',
      direccion: pedido.direccion_envio ?? '',
      referencia: '',
      dni:       '00000000',
    }

    // Crear envío en Sharf
    const { trackingNumber, trackingURL, orderNumber } = await crearEnvioSharf({
      pedido,
      subpedidos,
      datosEntrega,
      almacen: req.body.almacen ?? {},
    })

    // Guardar tracking en salidas_paquetes (con captura de error)
    const { error: errSalida } = await supabase.from('salidas_paquetes').update({
      tracking_number:    trackingNumber,
      tracking_url:       trackingURL,
      sharf_order_number: orderNumber,
      sharf_status:       '5423',
      sharf_status_desc:  'EMITIDO',
    }).eq('id', salidaId)
    if (errSalida) {
      console.error('❌ Error guardando salida_paquetes:', errSalida.message)
    } else {
      console.log('✅ salida_paquetes actualizada:', salidaId)
    }

    // Guardar tracking en cada subpedido y cambiar estado a en_ruta
    for (const sub of subpedidos) {
      const { error: errSub } = await supabase.from('subpedidos').update({
        estado:          'en_ruta',
        tracking_number: trackingNumber,
        sharf_status:    '5423',
        sharf_status_desc: 'EMITIDO',
      }).eq('id', sub.id)
      if (errSub) console.error('❌ Error subpedido', sub.id, ':', errSub.message)
    }

    // Marcar el pedido principal como enviado (para que la app del
    // cliente muestre "En camino" en vez de "Procesando")
    const { error: errPedido } = await supabase.from('pedidos')
      .update({ estado_pedido: 'enviado', numero_rastreo: trackingNumber })
      .eq('id', pedido.id)
    if (errPedido) console.error('❌ Error actualizando pedido:', errPedido.message)
    else console.log('✅ Pedido marcado como enviado:', pedido.id)

    return res.json({
      message:        '✅ Envío creado en Sharf',
      trackingNumber,
      trackingURL,
    })
  } catch (err) {
    console.error('❌ despacho Sharf:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /api/sharf/tracking/:trackingNumber ───────────────────────────────────
router.get('/tracking/:trackingNumber', async (req, res) => {
  try {
    const tracking = await consultarTracking(req.params.trackingNumber)
    if (!tracking) return res.status(404).json({ error: 'Tracking no encontrado' })
    return res.json(tracking)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /api/sharf/tracking/pedido/:orderNumber ───────────────────────────────
router.get('/tracking/pedido/:orderNumber', async (req, res) => {
  try {
    const tracking = await consultarTrackingPorPedido(req.params.orderNumber)
    if (!tracking) return res.status(404).json({ error: 'Tracking no encontrado' })
    return res.json(tracking)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/sharf/webhook ───────────────────────────────────────────────────
// Sharf llama a este endpoint cuando cambia el estado de un envío
router.post('/webhook', async (req, res) => {
  try {
    // Verificar que la notificación viene realmente de Sharf
    const secretRecibido = req.headers['x-client-secret']
    if (!process.env.SHARF_WEBHOOK_SECRET ||
        secretRecibido !== process.env.SHARF_WEBHOOK_SECRET) {
      console.warn('⚠️ Webhook Sharf con secret inválido — rechazado')
      return res.status(401).json({ error: 'No autorizado' })
    }

    console.log('📦 Webhook Sharf recibido:', JSON.stringify(req.body))
    await procesarWebhookSharf(req.body)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('❌ Webhook Sharf error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router