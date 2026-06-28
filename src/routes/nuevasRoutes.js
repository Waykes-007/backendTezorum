// src/routes/nuevasRoutes.js
// Agregar en app.js ANTES de: app.use('/api', apiRoutes)
//   const nuevasRoutes = require('./routes/nuevasRoutes')
//   app.use('/api', nuevasRoutes)

const express       = require('express')
const router        = express.Router()
const supabase      = require('../config/supabase')
const walletService = require('../services/walletService')

// ══════════════════════════════════════════════════════════════
// DIRECCIONES
// ══════════════════════════════════════════════════════════════

router.get('/direcciones/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('direcciones_usuario')
      .select('*')
      .eq('usuario_id', req.params.userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/direcciones', async (req, res) => {
  try {
    const { usuario_id, label, nombre, direccion, distrito, telefono, is_default } = req.body
    if (!usuario_id || !nombre || !direccion || !distrito || !telefono)
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    if (is_default) {
      await supabase.from('direcciones_usuario')
        .update({ is_default: false }).eq('usuario_id', usuario_id)
    }
    const { data, error } = await supabase
      .from('direcciones_usuario')
      .insert({ usuario_id, label: label ?? 'Casa', nombre, direccion, distrito, telefono, is_default: !!is_default })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/direcciones/:id', async (req, res) => {
  try {
    const { usuario_id, label, nombre, direccion, distrito, telefono, is_default } = req.body
    if (is_default) {
      await supabase.from('direcciones_usuario')
        .update({ is_default: false }).eq('usuario_id', usuario_id)
    }
    const { data, error } = await supabase
      .from('direcciones_usuario')
      .update({ label, nombre, direccion, distrito, telefono, is_default: !!is_default })
      .eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/direcciones/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('direcciones_usuario').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ message: 'Dirección eliminada' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// MÉTODOS DE PAGO
// ══════════════════════════════════════════════════════════════

router.get('/metodos-pago/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('metodos_pago_usuario')
      .select('id, tipo, label, ultimos4, vencimiento, es_default')
      .eq('usuario_id', req.params.userId)
      .order('es_default', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/metodos-pago', async (req, res) => {
  try {
    const { usuario_id, tipo, label, token_izipay, ultimos4, vencimiento, es_default } = req.body
    if (!usuario_id || !tipo || !label)
      return res.status(400).json({ error: 'Faltan campos' })
    if (es_default) {
      await supabase.from('metodos_pago_usuario')
        .update({ es_default: false }).eq('usuario_id', usuario_id)
    }
    const { data, error } = await supabase
      .from('metodos_pago_usuario')
      .insert({ usuario_id, tipo, label, token_izipay, ultimos4, vencimiento, es_default: !!es_default })
      .select('id, tipo, label, ultimos4, vencimiento, es_default').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/metodos-pago/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('metodos_pago_usuario').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ message: 'Método eliminado' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// NOTIFICACIONES
// Columnas reales: id, tienda_id, tipo, titulo, mensaje, leida,
//                 datos (jsonb), fecha, usuario_id, cuerpo, created_at
// ══════════════════════════════════════════════════════════════

router.get('/notificaciones/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, tipo, leida, fecha, datos')
      .eq('usuario_id', req.params.userId)
      .order('fecha', { ascending: false })
      .limit(50)
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Notificaciones del vendedor por tiendaId
router.get('/notificaciones/tienda/:tiendaId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, tipo, leida, fecha, datos')
      .eq('tienda_id', req.params.tiendaId)
      .order('fecha', { ascending: false })
      .limit(50)
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/notificaciones/:id/leer', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notificaciones').update({ leida: true }).eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/notificaciones/leer-todas/:userId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('usuario_id', req.params.userId)
      .eq('leida', false)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/notificaciones/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notificaciones').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// SEGUIDORES DE TIENDA
// ══════════════════════════════════════════════════════════════

router.post('/tiendas/:tiendaId/seguir', async (req, res) => {
  try {
    const { usuario_id } = req.body
    if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' })
    const { error } = await supabase
      .from('seguidores_tienda')
      .upsert({ usuario_id, tienda_id: req.params.tiendaId },
               { onConflict: 'usuario_id,tienda_id' })
    if (error) throw error
    res.status(201).json({ siguiendo: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/tiendas/:tiendaId/seguir/:userId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('seguidores_tienda')
      .delete()
      .eq('tienda_id', req.params.tiendaId)
      .eq('usuario_id', req.params.userId)
    if (error) throw error
    res.json({ siguiendo: false })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// LOGROS
// ══════════════════════════════════════════════════════════════

router.get('/logros/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('logros_usuario')
      .select('*')
      .eq('usuario_id', req.params.userId)
      .order('obtenido_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

async function otorgarLogro(usuarioId, tipoLogro, descripcion) {
  try {
    await supabase.from('logros_usuario').upsert(
      { usuario_id: usuarioId, tipo_logro: tipoLogro, descripcion },
      { onConflict: 'usuario_id,tipo_logro' }
    )
  } catch (_) {}
}
module.exports.otorgarLogro = otorgarLogro

// ══════════════════════════════════════════════════════════════
// RULETA — cooldown 24h
// usuarios: id, ultima_ruleta (nueva columna agregada)
// ══════════════════════════════════════════════════════════════

const PREMIOS_RULETA = [
  { tipo: 'saldo',   valor: 1.00,  descripcion: '¡Ganaste S/ 1.00!' },
  { tipo: 'saldo',   valor: 2.00,  descripcion: '¡Ganaste S/ 2.00!' },
  { tipo: 'saldo',   valor: 0.50,  descripcion: '¡Ganaste S/ 0.50!' },
  { tipo: 'cupon',   valor: 10.00, descripcion: '¡Cupón de S/ 10!' },
  { tipo: 'nothing', valor: 0,     descripcion: 'Mejor suerte mañana 🎲' },
  { tipo: 'saldo',   valor: 5.00,  descripcion: '¡Ganaste S/ 5.00!' },
]

router.get('/ruleta/estado/:userId', async (req, res) => {
  try {
    const { data: u, error } = await supabase
      .from('usuarios').select('ultima_ruleta').eq('id', req.params.userId).single()
    if (error) throw error
    const puedeGirar = !u.ultima_ruleta ||
      (Date.now() - new Date(u.ultima_ruleta).getTime()) >= 24 * 60 * 60 * 1000
    const horasRestantes = puedeGirar ? 0 : parseFloat(
      (24 - (Date.now() - new Date(u.ultima_ruleta).getTime()) / (1000 * 60 * 60)).toFixed(1)
    )
    res.json({ puedeGirar, horasRestantes })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/ruleta/girar', async (req, res) => {
  try {
    const { usuario_id } = req.body
    if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' })

    const { data: u, error: uErr } = await supabase
      .from('usuarios').select('ultima_ruleta').eq('id', usuario_id).single()
    if (uErr) throw uErr

    if (u.ultima_ruleta) {
      const diffHoras = (Date.now() - new Date(u.ultima_ruleta).getTime()) / (1000 * 60 * 60)
      if (diffHoras < 24) {
        return res.status(429).json({
          error: `Puedes girar en ${(24 - diffHoras).toFixed(1)} horas`,
          horasRestantes: parseFloat((24 - diffHoras).toFixed(1)),
        })
      }
    }

    const idx    = Math.floor(Math.random() * PREMIOS_RULETA.length)
    const premio = PREMIOS_RULETA[idx]

    await supabase.from('usuarios')
      .update({ ultima_ruleta: new Date().toISOString() }).eq('id', usuario_id)

    if (premio.tipo === 'saldo' && premio.valor > 0) {
      await walletService.modificarSaldo(
        usuario_id, premio.valor, 'ingreso',
        `Premio Ruleta Waykes — ${premio.descripcion}`
      )
    }

    res.json({ premio, indice: idx })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// DASHBOARD VENDEDOR
// subpedidos: tienda_id, estado, fecha_creacion ✅ (no tiene monto_vendedor)
// resenas: producto_id, calificacion ✅ (no tiene tienda_id directo)
// productos: tienda_id, estado_aprobacion ✅ (no tiene activo)
// ══════════════════════════════════════════════════════════════

router.get('/vendedores/dashboard/:tiendaId', async (req, res) => {
  try {
    const { tiendaId } = req.params
    const inicioSemana = new Date()
    inicioSemana.setDate(inicioSemana.getDate() - 7)

    // Subpedidos últimos 7 días — fecha_creacion ✅
    const { data: subpedidos } = await supabase
      .from('subpedidos')
      .select('estado, fecha_creacion')
      .eq('tienda_id', tiendaId)
      .gte('fecha_creacion', inicioSemana.toISOString())

    const totalPedidosSemana = (subpedidos ?? [])
      .filter(s => s.estado !== 'cancelado').length

    // Productos aprobados — estado_aprobacion ✅
    const { data: prods } = await supabase
      .from('productos')
      .select('id')
      .eq('tienda_id', tiendaId)
      .eq('estado_aprobacion', 'publicado')

    const prodIds = (prods ?? []).map(p => p.id)
    let rating = 5.0
    let totalResenas = 0

    // Reseñas via producto_id — calificacion ✅
    if (prodIds.length > 0) {
      const { data: resenas } = await supabase
        .from('resenas')
        .select('calificacion')
        .in('producto_id', prodIds)

      totalResenas = resenas?.length ?? 0
      rating = totalResenas > 0
        ? parseFloat(
            (resenas.reduce((s, r) => s + (r.calificacion ?? 0), 0) / totalResenas).toFixed(1)
          )
        : 5.0
    }

    res.json({
      totalPedidosSemana,
      rating,
      totalResenas,
      totalProductos: prodIds.length,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// VENTAS DEL VENDEDOR
// subpedidos: fecha_creacion ✅ (no tiene created_at ni monto_vendedor)
// ══════════════════════════════════════════════════════════════

router.get('/subpedidos', async (req, res) => {
  try {
    const { tiendaId } = req.query
    if (!tiendaId) return res.status(400).json({ error: 'Falta tiendaId' })

    const { data, error } = await supabase
      .from('subpedidos')
      .select(`
        id, codigo_subpedido, estado, fecha_creacion,
        tracking_number, sharf_status, sharf_status_desc,
        pedidos(id, numero_pedido, nombre_destinatario, direccion_envio)
      `)
      .eq('tienda_id', tiendaId)
      .order('fecha_creacion', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// PERFIL DE TIENDA
// tiendas: whatsapp_contacto ✅, direccion_almacen ✅
// NO tiene email_contacto ni descripcion_tienda
// ══════════════════════════════════════════════════════════════

router.put('/tiendas/:id', async (req, res) => {
  try {
    const { whatsapp_contacto, direccion_almacen } = req.body
    const { data, error } = await supabase
      .from('tiendas')
      .update({ whatsapp_contacto, direccion_almacen })
      .eq('id', req.params.id)
      .select('id, nombre_tienda, whatsapp_contacto, direccion_almacen')
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// RESEÑAS POR USUARIO
// resenas: usuario_id, calificacion, comentario, fecha_creacion, imagenes ✅
// productos: nombre_producto, imagenes (ARRAY) ✅ (no tiene imagen_url)
// ══════════════════════════════════════════════════════════════

router.get('/resenas/usuario/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resenas')
      .select('id, calificacion, comentario, fecha_creacion, imagenes, productos(nombre_producto, imagenes)')
      .eq('usuario_id', req.params.userId)
      .order('fecha_creacion', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// PRODUCTOS VENDEDOR — CRUD
// productos: nombre_producto, precio_normal, precio_oferta,
//            stock_disponible, imagenes (ARRAY), estado_aprobacion,
//            categoria_id (int), subcategoria_id (int) ✅
// ══════════════════════════════════════════════════════════════

router.post('/productos-vendedor', async (req, res) => {
  try {
    const { tienda_id, nombre_producto, descripcion, precio_normal,
            precio_oferta, imagenes, categoria_id, subcategoria_id,
            stock_disponible } = req.body

    if (!tienda_id || !nombre_producto || !precio_normal)
      return res.status(400).json({ error: 'Faltan campos requeridos' })

    const { data, error } = await supabase
      .from('productos')
      .insert({
        tienda_id,
        nombre_producto,
        descripcion,
        precio_normal:     parseFloat(precio_normal),
        precio_oferta:     precio_oferta ? parseFloat(precio_oferta) : null,
        imagenes:          imagenes ?? [],
        categoria_id:      categoria_id  ? parseInt(categoria_id)  : null,
        subcategoria_id:   subcategoria_id ? parseInt(subcategoria_id) : null,
        stock_disponible:  parseInt(stock_disponible) || 0,
        estado_aprobacion: 'pendiente',
      })
      .select().single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/productos-vendedor/:id', async (req, res) => {
  try {
    const { tienda_id, nombre_producto, descripcion, precio_normal,
            precio_oferta, imagenes, stock_disponible } = req.body

    const { data: prod } = await supabase
      .from('productos').select('tienda_id').eq('id', req.params.id).single()
    if (!prod || prod.tienda_id !== tienda_id)
      return res.status(403).json({ error: 'Sin permiso sobre este producto' })

    const update = {}
    if (nombre_producto !== undefined)  update.nombre_producto  = nombre_producto
    if (descripcion !== undefined)      update.descripcion       = descripcion
    if (precio_normal !== undefined)    update.precio_normal     = parseFloat(precio_normal)
    if (precio_oferta !== undefined)    update.precio_oferta     = precio_oferta ? parseFloat(precio_oferta) : null
    if (imagenes !== undefined)         update.imagenes          = imagenes
    if (stock_disponible !== undefined) update.stock_disponible  = parseInt(stock_disponible)

    const { data, error } = await supabase
      .from('productos').update(update).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/productos-vendedor/:id', async (req, res) => {
  try {
    const { tienda_id } = req.query
    const { data: prod } = await supabase
      .from('productos').select('tienda_id').eq('id', req.params.id).single()
    if (!prod || prod.tienda_id !== tienda_id)
      return res.status(403).json({ error: 'Sin permiso' })
    // Soft delete — cambiar a rechazado
    await supabase.from('productos')
      .update({ estado_aprobacion: 'rechazado' }).eq('id', req.params.id)
    res.json({ message: 'Producto desactivado' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// CATEGORÍAS
// categorias: id (int), nombre, slug, url_icono ✅ (no tiene emoji)
// ══════════════════════════════════════════════════════════════

router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias').select('id, nombre, slug, url_icono').order('nombre')
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// CARRITO — actualizar cantidad
// carrito: usuario_id, producto_id, cantidad ✅
// ══════════════════════════════════════════════════════════════

router.put('/carrito/cantidad', async (req, res) => {
  try {
    const { usuario_id, producto_id, cantidad } = req.body
    if (!usuario_id || !producto_id)
      return res.status(400).json({ error: 'Faltan campos' })

    if (parseInt(cantidad) <= 0) {
      await supabase.from('carrito')
        .delete()
        .eq('usuario_id', usuario_id)
        .eq('producto_id', producto_id)
      return res.json({ message: 'Ítem eliminado' })
    }

    const { error } = await supabase
      .from('carrito')
      .update({ cantidad: parseInt(cantidad) })
      .eq('usuario_id', usuario_id)
      .eq('producto_id', producto_id)

    if (error) throw error
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// PERFIL DE USUARIO
// usuarios: nombre_completo, correo_electronico, telefono,
//           saldo_disponible, codigo_referido_propio, rol ✅
// ══════════════════════════════════════════════════════════════

router.get('/usuarios/perfil/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        id, nombre_completo, correo_electronico, telefono,
        saldo_disponible, codigo_referido_propio,
        id_referido_por, tiene_producto_gratis, rol
      `)
      .eq('id', req.params.id)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router

// ══════════════════════════════════════════════════════════════
// PROMOCIONES — datos reales para OffersScreen
// GET /api/promociones
// ══════════════════════════════════════════════════════════════

router.get('/promociones', async (req, res) => {
  try {
    // ── Flash: productos con es_oferta_flash = true ─────────
    const { data: flashData } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta, precio_flash, tiendas(nombre_tienda)')
      .eq('es_oferta_flash', true)
      .eq('estado_aprobacion', 'publicado')
      .limit(20)

    const flash = (flashData ?? []).map(p => ({
      producto_id:      p.id,
      nombre:           p.nombre_producto,
      imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
      precio_normal:    parseFloat(p.precio_normal) || 0,
      precio_promocion: parseFloat(p.precio_flash ?? p.precio_oferta ?? p.precio_normal) || 0,
    }))

    // ── Con oferta: productos con precio_oferta < precio_normal ─
    const { data: ofertasData } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta')
      .eq('estado_aprobacion', 'publicado')
      .not('precio_oferta', 'is', null)
      .limit(20)

    const con_oferta = (ofertasData ?? [])
      .filter(p => parseFloat(p.precio_oferta) < parseFloat(p.precio_normal))
      .map(p => ({
        producto_id:      p.id,
        nombre:           p.nombre_producto,
        imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
        precio_normal:    parseFloat(p.precio_normal) || 0,
        precio_promocion: parseFloat(p.precio_oferta) || 0,
      }))

    // ── Más vendidos ─────────────────────────────────────────
    const { data: topData } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta')
      .eq('es_mas_vendido', true)
      .eq('estado_aprobacion', 'publicado')
      .limit(12)

    // Si no hay marcados como más vendidos, usar los que tienen mayor calificación
    let mas_vendidos = (topData ?? []).map(p => ({
      producto_id:      p.id,
      nombre:           p.nombre_producto,
      imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
      precio_normal:    parseFloat(p.precio_normal) || 0,
      precio_promocion: parseFloat(p.precio_oferta ?? p.precio_normal) || 0,
    }))

    if (mas_vendidos.length === 0) {
      const { data: topRating } = await supabase
        .from('productos')
        .select('id, nombre_producto, imagenes, precio_normal, precio_oferta, calificacion_promedio')
        .eq('estado_aprobacion', 'publicado')
        .order('calificacion_promedio', { ascending: false })
        .limit(8)
      mas_vendidos = (topRating ?? []).map(p => ({
        producto_id:      p.id,
        nombre:           p.nombre_producto,
        imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
        precio_normal:    parseFloat(p.precio_normal) || 0,
        precio_promocion: parseFloat(p.precio_oferta ?? p.precio_normal) || 0,
      }))
    }

    // ── Liquidación ──────────────────────────────────────────
    const { data: liquidData } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta')
      .eq('es_liquidacion', true)
      .eq('estado_aprobacion', 'publicado')
      .limit(12)

    const liquidacion = (liquidData ?? []).map(p => ({
      producto_id:      p.id,
      nombre:           p.nombre_producto,
      imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
      precio_normal:    parseFloat(p.precio_normal) || 0,
      precio_promocion: parseFloat(p.precio_oferta ?? p.precio_normal) || 0,
    }))

    // ── Gancho < S/9.90 ──────────────────────────────────────
    const { data: ganchoData } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta')
      .eq('es_gancho_menor_9_90', true)
      .eq('estado_aprobacion', 'publicado')
      .limit(12)

    const gancho = (ganchoData ?? []).map(p => ({
      producto_id:      p.id,
      nombre:           p.nombre_producto,
      imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
      precio_normal:    parseFloat(p.precio_normal) || 0,
      precio_promocion: parseFloat(p.precio_oferta ?? p.precio_normal) || 0,
    }))

    res.json({
      flash,
      con_oferta,   // productos con precio_oferta activo
      mas_vendidos,
      liquidacion,
      gancho,
      total: flash.length + con_oferta.length + mas_vendidos.length + liquidacion.length + gancho.length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// FAVORITOS
// GET  /api/favoritos/:userId
// POST /api/favoritos  { usuario_id, producto_id }
// DELETE /api/favoritos/:userId/:productoId
// GET /api/productos/buscar?nombre=X
// ══════════════════════════════════════════════════════════════

router.get('/favoritos/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('favoritos')
      .select('producto_id, productos(id, nombre_producto, imagenes, precio_normal, precio_oferta)')
      .eq('usuario_id', req.params.userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/favoritos', async (req, res) => {
  try {
    const { usuario_id, producto_id } = req.body
    if (!usuario_id || !producto_id)
      return res.status(400).json({ error: 'Faltan campos' })
    const { error } = await supabase
      .from('favoritos')
      .upsert({ usuario_id, producto_id },
               { onConflict: 'usuario_id,producto_id' })
    if (error) throw error
    res.status(201).json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/favoritos/:userId/:productoId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('favoritos')
      .delete()
      .eq('usuario_id', req.params.userId)
      .eq('producto_id', req.params.productoId)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/productos/buscar', async (req, res) => {
  try {
    const { nombre } = req.query
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' })
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta')
      .ilike('nombre_producto', `%${nombre}%`)
      .eq('estado_aprobacion', 'publicado')
      .limit(5)
    if (error) throw error
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// REEMPLAZAR /api/promociones con lógica basada en BD real
// Productos con precio_oferta = sección "Ofertas"
// Productos con es_oferta_flash = true = sección "Flash"
// ══════════════════════════════════════════════════════════════
// NOTA: El router.get('/promociones') anterior fue reemplazado
// Este nuevo endpoint tiene prioridad por estar después
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// GET /api/productos — con join de tiendas para tiendaNombre
// ══════════════════════════════════════════════════════════════
router.get('/productos', async (req, res) => {
  try {
    const { limit = 20, offset = 0, estado = 'publicado', tiendaId } = req.query

    let query = supabase
      .from('productos')
      .select(`
        id, nombre_producto, descripcion, precio_normal, precio_oferta,
        precio_flash, imagenes, calificacion_promedio, stock_disponible,
        estado_aprobacion, tienda_id, es_oferta_flash, es_mas_vendido,
        tiendas(id, nombre_tienda)
      `)
      .eq('estado_aprobacion', estado)
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
      .order('fecha_creacion', { ascending: false })

    if (tiendaId) query = query.eq('tienda_id', tiendaId)

    const { data, error } = await query
    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/ofertas-flash/activas — con join de tiendas
// ══════════════════════════════════════════════════════════════
router.get('/ofertas-flash/activas', async (req, res) => {
  try {
    // Primero buscar productos marcados como es_oferta_flash
    const { data, error } = await supabase
      .from('productos')
      .select(`
        id, nombre_producto, precio_normal, precio_oferta, precio_flash,
        imagenes, calificacion_promedio, stock_disponible, estado_aprobacion,
        tienda_id, tiendas(id, nombre_tienda)
      `)
      .eq('es_oferta_flash', true)
      .eq('estado_aprobacion', 'publicado')
      .limit(20)

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})