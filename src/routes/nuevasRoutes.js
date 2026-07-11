// src/routes/nuevasRoutes.js
// Agregar en app.js ANTES de: app.use('/api', apiRoutes)
//   const nuevasRoutes = require('./routes/nuevasRoutes')
//   app.use('/api', nuevasRoutes)

const express       = require('express')
const router        = express.Router()
const supabase      = require('../config/supabase')
const walletService = require('../services/walletService')

// ══════════════════════════════════════════════════════════════
// UBICACIÓN GEOGRÁFICA (cascada Departamento → Provincia → Distrito)
// ══════════════════════════════════════════════════════════════
router.get('/ubicacion/departamentos', async (req, res) => {
  const { data, error } = await supabase.from('departamentos').select('*').order('departamento')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})
router.get('/ubicacion/provincias/:depId', async (req, res) => {
  const { data, error } = await supabase.from('provincias').select('*')
    .eq('departamento_id', req.params.depId).order('provincia')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})
router.get('/ubicacion/distritos/:provId', async (req, res) => {
  const { data, error } = await supabase.from('distritos').select('*')
    .eq('provincia_id', req.params.provId).order('distrito')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

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
    const { usuario_id, label, nombre, direccion, distrito, telefono, is_default,
            departamento_id, provincia_id, distrito_id, referencia,
            telefono_secundario, dni_receptor, indicaciones_entrega } = req.body
    if (!usuario_id || !nombre || !direccion || !distrito || !telefono)
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    if (is_default) {
      await supabase.from('direcciones_usuario')
        .update({ is_default: false }).eq('usuario_id', usuario_id)
    }
    const { data, error } = await supabase
      .from('direcciones_usuario')
      .insert({ usuario_id, label: label ?? 'Casa', nombre, direccion, distrito, telefono,
                is_default: !!is_default,
                departamento_id: departamento_id ?? null, provincia_id: provincia_id ?? null,
                distrito_id: distrito_id ?? null, referencia: referencia ?? null,
                telefono_secundario: telefono_secundario ?? null, dni_receptor: dni_receptor ?? null,
                indicaciones_entrega: indicaciones_entrega ?? null })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/direcciones/:id', async (req, res) => {
  try {
    const { usuario_id, label, nombre, direccion, distrito, telefono, is_default,
            departamento_id, provincia_id, distrito_id, referencia,
            telefono_secundario, dni_receptor, indicaciones_entrega } = req.body
    if (is_default) {
      await supabase.from('direcciones_usuario')
        .update({ is_default: false }).eq('usuario_id', usuario_id)
    }
    const { data, error } = await supabase
      .from('direcciones_usuario')
      .update({ label, nombre, direccion, distrito, telefono, is_default: !!is_default,
                departamento_id: departamento_id ?? null, provincia_id: provincia_id ?? null,
                distrito_id: distrito_id ?? null, referencia: referencia ?? null,
                telefono_secundario: telefono_secundario ?? null, dni_receptor: dni_receptor ?? null,
                indicaciones_entrega: indicaciones_entrega ?? null })
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
    const ahora = new Date().toISOString()

    // ── Flash: SOLO ofertas con registro activo en ofertas_flash ──
    const { data: flashData } = await supabase
      .from('ofertas_flash')
      .select(`
        id, producto_id, tipo_limite, valor_limite, usos_actuales,
        precio_oferta, activa,
        productos(id, nombre_producto, imagenes, precio_normal, precio_oferta,
          estado_aprobacion, calificacion_promedio,
          tiendas(id, nombre_tienda, es_vendedor_oro, tienda_verificada))
      `)
      .eq('activa', true)
      .limit(20)

    // Filtrar: producto debe estar publicado, y si es por tiempo no debe haber expirado
    const flashVigentes = (flashData ?? []).filter(o => {
      if (!o.productos || o.productos.estado_aprobacion !== 'publicado') return false
      if (o.tipo_limite === 'tiempo') {
        return new Date(o.valor_limite) > new Date()
      }
      if (o.tipo_limite === 'cantidad') {
        const limite = parseInt(o.valor_limite) || 0
        return o.usos_actuales < limite
      }
      return true
    })

    const flash = flashVigentes.map(o => ({
      producto_id:      o.productos.id,
      nombre:           o.productos.nombre_producto,
      imagen:           Array.isArray(o.productos.imagenes) && o.productos.imagenes.length > 0
                          ? o.productos.imagenes[0] : null,
      precio_normal:    parseFloat(o.productos.precio_normal) || 0,
      precio_promocion: parseFloat(o.precio_oferta) || 0,
      precio_oferta:    parseFloat(o.productos.precio_oferta) || null,
      tipo_limite:      o.tipo_limite,
      valor_limite:     o.valor_limite,
      usos_actuales:    o.usos_actuales,
      oferta_flash_id:  o.id,
      unidades_vendidas:    0,
      calificacion_promedio: o.productos.calificacion_promedio ?? 0,
      es_vendedor_oro:      o.productos.tiendas?.es_vendedor_oro === true,
      tienda_verificada:    o.productos.tiendas?.tienda_verificada === true,
    }))

    // ── Con oferta: productos con precio_oferta < precio_normal ─
    // Traer TODOS los productos publicados con su tienda; filtramos oferta en JS.
    // (join a tiendas por separado para que un tienda_id null no vacíe la query)
    const { data: ofertasData, error: ofertasErr } = await supabase
      .from('productos')
      .select(`id, nombre_producto, imagenes, precio_normal, precio_oferta,
        es_oferta_flash, precio_flash, tienda_id,
        calificacion_promedio, estado_aprobacion`)
      .eq('estado_aprobacion', 'publicado')
      .limit(200)
    if (ofertasErr) console.error('❌ promociones con_oferta:', ofertasErr.message)

    // Mapa de tiendas para saber Oro/verificada sin join frágil
    const { data: tiendasData } = await supabase
      .from('tiendas')
      .select('id, es_vendedor_oro, tienda_verificada')
    const tiendaMap = {}
    for (const t of (tiendasData ?? [])) tiendaMap[t.id] = t

    // Un producto va a "con oferta" si su precio_oferta es menor al normal
    const con_oferta = (ofertasData ?? [])
      .filter(p => {
        const normal = parseFloat(p.precio_normal) || 0
        const oferta = parseFloat(p.precio_oferta) || 0
        return oferta > 0 && oferta < normal
      })
      .map(p => {
        const t = tiendaMap[p.tienda_id] || {}
        return {
          producto_id:      p.id,
          nombre:           p.nombre_producto,
          imagen:           Array.isArray(p.imagenes) && p.imagenes.length > 0 ? p.imagenes[0] : null,
          precio_normal:    parseFloat(p.precio_normal) || 0,
          precio_promocion: parseFloat(p.precio_oferta) || 0,
          precio_oferta:    parseFloat(p.precio_oferta) || null,
          unidades_vendidas:    0,
          calificacion_promedio: p.calificacion_promedio ?? 0,
          es_vendedor_oro:      t.es_vendedor_oro === true,
          tienda_verificada:    t.tienda_verificada === true,
        }
      })

    // ── Más vendidos ─────────────────────────────────────────
    const { data: topData } = await supabase
      .from('productos')
      .select('id, nombre_producto, imagenes, precio_normal, precio_oferta')
      .eq('es_mas_vendido', true)
      .eq('estado_aprobacion', 'publicado')
      .limit(12)

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
      con_oferta,
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
      .select(`producto_id, productos(
        id, nombre_producto, descripcion, precio_normal, precio_oferta,
        precio_flash, imagenes, calificacion_promedio, stock_disponible,
        estado_aprobacion, tienda_id, categoria_id, subcategoria_id,
        es_oferta_flash, es_mas_vendido,
        tiendas(id, nombre_tienda, tienda_verificada, es_vendedor_oro)
      )`)
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
// Notificaciones del CLIENTE (tabla notificaciones_usuario)
// ══════════════════════════════════════════════════════════════
// Listar las últimas 50 notificaciones del usuario
router.get('/usuarios/:userId/notificaciones', async (req, res) => {
  const { userId } = req.params
  try {
    const { data, error } = await supabase
      .from('notificaciones_usuario')
      .select('id, titulo, mensaje, tipo, leida, fecha_creacion')
      .eq('usuario_id', userId)
      .order('fecha_creacion', { ascending: false })
      .limit(50)
    if (error) throw error
    return res.json(data ?? [])
  } catch (e) {
    console.error('Error listando notificaciones:', e.message)
    return res.status(500).json({ error: e.message })
  }
})

// Marcar UNA notificación como leída
router.patch('/usuarios/notificaciones/:id/leer', async (req, res) => {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('notificaciones_usuario')
      .update({ leida: true })
      .eq('id', id)
    if (error) throw error
    return res.json({ message: 'Notificación leída ✅' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
})

// Eliminar UNA notificación
router.delete('/usuarios/notificaciones/:id', async (req, res) => {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('notificaciones_usuario')
      .delete()
      .eq('id', id)
    if (error) throw error
    return res.json({ message: 'Notificación eliminada ✅' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
})

// Marcar TODAS las notificaciones del usuario como leídas
router.patch('/usuarios/:userId/notificaciones/leer', async (req, res) => {
  const { userId } = req.params
  try {
    const { error } = await supabase
      .from('notificaciones_usuario')
      .update({ leida: true })
      .eq('usuario_id', userId)
      .eq('leida', false)
    if (error) throw error
    return res.json({ message: 'Notificaciones marcadas como leídas ✅' })
  } catch (e) {
    console.error('Error marcando notificaciones:', e.message)
    return res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/usuarios/:userId/stats — estadísticas reales del perfil
// (pedidos, notificaciones no leídas y nivel de cliente)
// ══════════════════════════════════════════════════════════════
router.get('/usuarios/:userId/stats', async (req, res) => {
  const { userId } = req.params
  try {
    // Total de pedidos del usuario
    const { count: pedidosTotal } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId)

    // Pedidos activos (aún no entregados ni cancelados)
    const { count: pedidosActivos } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId)
      .not('estado_pedido', 'in', '(entregado,cancelado)')

    // Pedidos entregados → definen el nivel del cliente
    const { count: pedidosEntregados } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId)
      .eq('estado_pedido', 'entregado')

    // Notificaciones no leídas del CLIENTE (tabla notificaciones_usuario;
    // la tabla `notificaciones` a secas es exclusiva de vendedores)
    const { count: notificacionesNoLeidas } = await supabase
      .from('notificaciones_usuario')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId)
      .eq('leida', false)

    // Nivel de cliente derivado de compras reales entregadas
    const entregados = pedidosEntregados ?? 0
    const nivel = entregados >= 10 ? 'Cliente Premium'
                : entregados >= 3  ? 'Cliente Frecuente'
                : 'Cliente Waykes'
    const nivelEmoji = entregados >= 10 ? '👑'
                     : entregados >= 3  ? '⭐'
                     : '🛍️'

    return res.json({
      pedidos_total:            pedidosTotal ?? 0,
      pedidos_activos:          pedidosActivos ?? 0,
      pedidos_entregados:       entregados,
      notificaciones_no_leidas: notificacionesNoLeidas ?? 0,
      nivel,
      nivel_emoji: nivelEmoji,
    })
  } catch (e) {
    console.error('Error en /usuarios/:userId/stats:', e.message)
    return res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/categorias — categorías reales con sus subcategorías
// (para la pantalla de Categorías de la app)
// ══════════════════════════════════════════════════════════════
router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('id, nombre, subcategorias(id, nombre)')
      .order('nombre', { ascending: true })

    if (error) throw error
    return res.json(data ?? [])
  } catch (e) {
    console.error('Error en /categorias:', e.message)
    return res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/productos — con join de tiendas para tiendaNombre
// ══════════════════════════════════════════════════════════════
router.get('/productos', async (req, res) => {
  try {
    const { limit = 20, offset = 0, estado = 'publicado', tiendaId, categoriaId, subcategoriaId } = req.query

    let query = supabase
      .from('productos')
      .select(`
        id, nombre_producto, descripcion, precio_normal, precio_oferta,
        precio_flash, imagenes, calificacion_promedio, stock_disponible,
        estado_aprobacion, tienda_id, categoria_id, subcategoria_id,
        es_oferta_flash, es_mas_vendido,
        subcategorias(id, nombre),
        tiendas(id, nombre_tienda, tienda_verificada, es_vendedor_oro)
      `)
      .eq('estado_aprobacion', estado)
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
      // ⭐ Prioridad Plan Oro: los productos de tiendas Oro aparecen
      // primero en el feed (beneficio "Primeras posiciones").
      // El orden se aplica en la query (no en la app) para que la
      // paginación funcione correctamente desde la página 1.
      .order('tiendas(es_vendedor_oro)', { ascending: false, nullsFirst: false })
      .order('fecha_creacion', { ascending: false })

    if (tiendaId)       query = query.eq('tienda_id', tiendaId)
    if (categoriaId)    query = query.eq('categoria_id', parseInt(categoriaId))
    if (subcategoriaId) query = query.eq('subcategoria_id', parseInt(subcategoriaId))

    const { data, error } = await query
    if (error) throw error

    const productos = data ?? []
    if (productos.length === 0) return res.json([])

    // Buscar ofertas_flash REALMENTE activas para estos productos
    const ids = productos.map(p => p.id)
    const { data: ofertas } = await supabase
      .from('ofertas_flash')
      .select('id, producto_id, tipo_limite, valor_limite, usos_actuales, precio_oferta, activa')
      .eq('activa', true)
      .in('producto_id', ids)

    const ofertasPorProducto = {}
    for (const o of (ofertas ?? [])) {
      // Validar vigencia
      let vigente = true
      if (o.tipo_limite === 'tiempo') vigente = new Date(o.valor_limite) > new Date()
      if (o.tipo_limite === 'cantidad') {
        const limite = parseInt(o.valor_limite) || 0
        vigente = o.usos_actuales < limite
      }
      if (vigente) ofertasPorProducto[o.producto_id] = o
    }

    // Calcular unidades vendidas reales — suma de cantidad en
    // detalle_pedidos para pedidos ya entregados de cada producto.
    const { data: ventas } = await supabase
      .from('detalle_pedidos')
      .select('producto_id, cantidad, pedidos!inner(estado_pedido)')
      .in('producto_id', ids)
      .eq('pedidos.estado_pedido', 'entregado')

    const ventasPorProducto = {}
    for (const v of (ventas ?? [])) {
      ventasPorProducto[v.producto_id] =
        (ventasPorProducto[v.producto_id] || 0) + (parseInt(v.cantidad) || 0)
    }

    // Inyectar estado real de oferta flash y ventas en cada producto
    const resultado = productos.map(p => {
      const oferta = ofertasPorProducto[p.id]
      return {
        ...p,
        es_oferta_flash: !!oferta,
        precio_flash:    oferta ? parseFloat(oferta.precio_oferta) : null,
        oferta_flash_id: oferta ? oferta.id : null,
        tipo_limite:     oferta ? oferta.tipo_limite : null,
        valor_limite:    oferta ? oferta.valor_limite : null,
        usos_actuales:   oferta ? oferta.usos_actuales : null,
        unidades_vendidas: ventasPorProducto[p.id] || 0,
      }
    })

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/ofertas-flash/activas — con join de tiendas
// ══════════════════════════════════════════════════════════════
router.get('/ofertas-flash/activas', async (req, res) => {
  try {
    // Solo ofertas con registro REAL y activo en ofertas_flash
    const { data, error } = await supabase
      .from('ofertas_flash')
      .select(`
        id, producto_id, tipo_limite, valor_limite, usos_actuales, precio_oferta, activa,
        productos(
          id, nombre_producto, precio_normal, precio_oferta, imagenes,
          calificacion_promedio, stock_disponible, estado_aprobacion,
          tienda_id, tiendas(id, nombre_tienda, tienda_verificada, es_vendedor_oro)
        )
      `)
      .eq('activa', true)
      .limit(20)

    if (error) throw error

    // Filtrar vigentes (no expiradas por tiempo, no agotadas por cantidad)
    const vigentes = (data ?? []).filter(o => {
      if (!o.productos || o.productos.estado_aprobacion !== 'publicado') return false
      if (o.tipo_limite === 'tiempo') return new Date(o.valor_limite) > new Date()
      if (o.tipo_limite === 'cantidad') {
        const limite = parseInt(o.valor_limite) || 0
        return o.usos_actuales < limite
      }
      return true
    })

    // Formato compatible con WaykesProduct.fromJson — inyectar precio_flash y datos de oferta
    const productos = vigentes.map(o => ({
      ...o.productos,
      precio_flash:     parseFloat(o.precio_oferta),
      es_oferta_flash:  true,
      oferta_flash_id:  o.id,
      tipo_limite:      o.tipo_limite,
      valor_limite:     o.valor_limite,
      usos_actuales:    o.usos_actuales,
    }))

    if (productos.length > 0) {
      const ids = productos.map(p => p.id)
      const { data: ventas } = await supabase
        .from('detalle_pedidos')
        .select('producto_id, cantidad, pedidos!inner(estado_pedido)')
        .in('producto_id', ids)
        .eq('pedidos.estado_pedido', 'entregado')

      const ventasPorProducto = {}
      for (const v of (ventas ?? [])) {
        ventasPorProducto[v.producto_id] =
          (ventasPorProducto[v.producto_id] || 0) + (parseInt(v.cantidad) || 0)
      }
      productos.forEach(p => {
        p.unidades_vendidas = ventasPorProducto[p.id] || 0
      })
    }

    res.json(productos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/productos/:id — detalle individual con descripción real
// ══════════════════════════════════════════════════════════════
router.get('/productos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select(`
        id, nombre_producto, descripcion, precio_normal, precio_oferta,
        precio_flash, imagenes, calificacion_promedio, stock_disponible,
        estado_aprobacion, tienda_id, categoria_id, subcategoria_id,
        es_oferta_flash, es_mas_vendido,
        subcategorias(id, nombre),
        tiendas(id, nombre_tienda, tienda_verificada, es_vendedor_oro)
      `)
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Producto no encontrado' })

    // Inyectar estado real de oferta flash vigente
    const { data: oferta } = await supabase
      .from('ofertas_flash')
      .select('id, tipo_limite, valor_limite, usos_actuales, precio_oferta, activa')
      .eq('producto_id', req.params.id)
      .eq('activa', true)
      .maybeSingle()

    let vigente = false
    if (oferta) {
      if (oferta.tipo_limite === 'tiempo') vigente = new Date(oferta.valor_limite) > new Date()
      else if (oferta.tipo_limite === 'cantidad') {
        const limite = parseInt(oferta.valor_limite) || 0
        vigente = oferta.usos_actuales < limite
      } else vigente = true
    }

    // Unidades vendidas reales (pedidos entregados)
    const { data: ventas } = await supabase
      .from('detalle_pedidos')
      .select('cantidad, pedidos!inner(estado_pedido)')
      .eq('producto_id', req.params.id)
      .eq('pedidos.estado_pedido', 'entregado')

    const unidadesVendidas = (ventas ?? [])
      .reduce((sum, v) => sum + (parseInt(v.cantidad) || 0), 0)

    res.json({
      ...data,
      es_oferta_flash: vigente,
      precio_flash:    vigente ? parseFloat(oferta.precio_oferta) : null,
      tipo_limite:     vigente ? oferta.tipo_limite : null,
      valor_limite:    vigente ? oferta.valor_limite : null,
      usos_actuales:   vigente ? oferta.usos_actuales : null,
      unidades_vendidas: unidadesVendidas,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// CARRITO — obtener, agregar, eliminar (con precio_final calculado)
// ══════════════════════════════════════════════════════════════

// Calcula el precio vigente de un producto: flash > oferta > normal
async function calcularPrecioFinal(producto) {
  const precioNormal = parseFloat(producto.precio_normal) || 0
  const precioOferta = parseFloat(producto.precio_oferta) || 0
  const precioFlash  = parseFloat(producto.precio_flash) || 0

  // Buscar si hay oferta_flash REALMENTE activa y vigente
  const { data: oferta } = await supabase
    .from('ofertas_flash')
    .select('tipo_limite, valor_limite, usos_actuales, precio_oferta, activa')
    .eq('producto_id', producto.id)
    .eq('activa', true)
    .maybeSingle()

  let vigente = false
  if (oferta) {
    if (oferta.tipo_limite === 'tiempo') vigente = new Date(oferta.valor_limite) > new Date()
    else if (oferta.tipo_limite === 'cantidad') {
      const limite = parseInt(oferta.valor_limite) || 0
      vigente = oferta.usos_actuales < limite
    } else vigente = true
  }

  if (vigente && oferta) {
    return { precio_final: parseFloat(oferta.precio_oferta), tiene_oferta_flash: true }
  }
  if (precioOferta > 0 && precioOferta < precioNormal) {
    return { precio_final: precioOferta, tiene_oferta_flash: false }
  }
  return { precio_final: precioNormal, tiene_oferta_flash: false }
}

router.get('/carrito/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('carrito')
      .select(`
        id, producto_id, cantidad,
        productos(id, nombre_producto, precio_normal, precio_oferta, precio_flash, imagenes)
      `)
      .eq('usuario_id', req.params.userId)

    if (error) throw error

    // Inyectar precio_final calculado para cada ítem
    const resultado = await Promise.all((data ?? []).map(async (item) => {
      if (!item.productos) return item
      const { precio_final, tiene_oferta_flash } = await calcularPrecioFinal(item.productos)
      return {
        ...item,
        productos: {
          ...item.productos,
          precio_final,
          tiene_oferta_flash,
        },
      }
    }))

    res.json(resultado)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/carrito/agregar', async (req, res) => {
  try {
    const { usuario_id, producto_id, cantidad } = req.body
    if (!usuario_id || !producto_id)
      return res.status(400).json({ error: 'Faltan campos' })

    const { data: existente } = await supabase
      .from('carrito')
      .select('id, cantidad')
      .eq('usuario_id', usuario_id)
      .eq('producto_id', producto_id)
      .maybeSingle()

    if (existente) {
      const { error } = await supabase
        .from('carrito')
        .update({ cantidad: parseInt(cantidad) || existente.cantidad + 1 })
        .eq('id', existente.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('carrito')
        .insert([{ usuario_id, producto_id, cantidad: parseInt(cantidad) || 1 }])
      if (error) throw error
    }

    res.status(201).json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/carrito/:userId/:productoId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('carrito')
      .delete()
      .eq('usuario_id', req.params.userId)
      .eq('producto_id', req.params.productoId)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ══════════════════════════════════════════════════════════════
// SUBIR IMAGEN DE RESEÑA — bucket 'resena' en Supabase Storage
// Recibe base64 desde Flutter, sube y devuelve la URL pública.
// ══════════════════════════════════════════════════════════════
router.post('/resenas/subir-imagen', async (req, res) => {
  try {
    const { imagen_base64, usuario_id, extension } = req.body
    if (!imagen_base64 || !usuario_id) {
      return res.status(400).json({ error: 'Faltan campos' })
    }

    const ext = (extension || 'jpg').replace('.', '')
    const nombreArchivo = `${usuario_id}_${Date.now()}.${ext}`
    const buffer = Buffer.from(imagen_base64, 'base64')

    const { error: uploadError } = await supabase.storage
      .from('resenas')
      .upload(nombreArchivo, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('resenas')
      .getPublicUrl(nombreArchivo)

    res.status(201).json({ url: urlData.publicUrl })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})