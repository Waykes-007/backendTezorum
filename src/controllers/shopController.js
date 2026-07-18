const supabase = require('../config/supabase');

const shopController = {

  // ── Productos del catálogo con calificación y conteo de reseñas ──
  async obtenerProductos(req, res) {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select(`
          *,
          categorias(nombre),
          tiendas(id, nombre_tienda, tienda_verificada, es_vendedor_oro),
          resenas(count)
        `)
        .eq('estado_aprobacion', 'publicado')
        .eq('es_combo', false);

      if (error) throw error;

      const formateados = (data ?? []).map(p => ({
        ...p,
        num_resenas: p.resenas?.[0]?.count ?? 0,
        resenas: undefined,
      }));

      return res.status(200).json(formateados);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  },

  // ── Producto por ID con calificación actualizada ──
  async getProductoPorId(req, res) {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('productos')
      .select(`
        *,
        categorias(nombre),
        tiendas(
          id, nombre_tienda, logo_url, portada_url,
          tienda_verificada, es_vendedor_oro, ofrece_garantia,
          fecha_inicio, likes
        ),
        resenas(count)
      `)
      .eq('id', id)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const resultado = {
      ...data,
      num_resenas: data.resenas?.[0]?.count ?? 0,
      resenas: undefined,
    };

    return res.json(resultado);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
},

  // ── Todas las promociones activas agrupadas por tipo ──
  async getPromociones(req, res) {
    try {
      const ahora = new Date().toISOString();

      // 1. Ofertas flash vigentes
      const { data: flashRaw } = await supabase
        .from('ofertas_flash')
        .select(`
          id, precio_oferta, tipo_limite, valor_limite, usos_actuales,
          productos (
            id, nombre_producto, precio_normal, precio_oferta,
            imagenes, es_oferta_flash
          )
        `)
        .eq('activa', true);

      const flash = (flashRaw ?? []).filter(o => {
        if (o.tipo_limite === 'tiempo') return o.valor_limite > ahora;
        if (o.tipo_limite === 'cantidad')
          return parseInt(o.usos_actuales) < parseInt(o.valor_limite);
        return true;
      }).map(o => ({
        tipo:             'flash',
        id:               o.id,
        producto_id:      o.productos?.id,
        nombre:           o.productos?.nombre_producto,
        imagen:           o.productos?.imagenes?.[0],
        precio_normal:    o.productos?.precio_normal,
        precio_promocion: o.precio_oferta,
        valor_limite:     o.valor_limite,
        usos_actuales:    o.usos_actuales,
        limite:           o.valor_limite,
        tipo_limite:      o.tipo_limite,
      }));

      // 2. Productos en liquidación
      const { data: liquidacion } = await supabase
        .from('productos')
        .select('id, nombre_producto, precio_normal, precio_oferta, imagenes')
        .eq('es_liquidacion', true)
        .eq('estado_aprobacion', 'publicado')
        .eq('es_combo', false)
        .gt('stock_disponible', 0);

      const liquidacionMapped = (liquidacion ?? []).map(p => ({
        tipo:             'liquidacion',
        id:               p.id,
        producto_id:      p.id,
        nombre:           p.nombre_producto,
        imagen:           p.imagenes?.[0],
        precio_normal:    p.precio_normal,
        precio_promocion: p.precio_oferta ?? p.precio_normal,
      }));

      // 3. Productos gancho < S/9.90
      const { data: gancho } = await supabase
        .from('productos')
        .select('id, nombre_producto, precio_normal, precio_oferta, imagenes')
        .eq('es_gancho_menor_9_90', true)
        .eq('estado_aprobacion', 'publicado')
        .eq('es_combo', false)
        .gt('stock_disponible', 0);

      const ganchoMapped = (gancho ?? []).map(p => ({
        tipo:             'gancho',
        id:               p.id,
        producto_id:      p.id,
        nombre:           p.nombre_producto,
        imagen:           p.imagenes?.[0],
        precio_normal:    p.precio_normal,
        precio_promocion: p.precio_oferta ?? p.precio_normal,
      }));

      // 4. Más vendidos con descuento
      const { data: masVendidos } = await supabase
        .from('productos')
        .select('id, nombre_producto, precio_normal, precio_oferta, imagenes')
        .eq('es_mas_vendido', true)
        .eq('estado_aprobacion', 'publicado')
        .eq('es_combo', false)
        .gt('stock_disponible', 0)
        .not('precio_oferta', 'is', null);

      const masVendidosMapped = (masVendidos ?? []).map(p => ({
        tipo:             'mas_vendido',
        id:               p.id,
        producto_id:      p.id,
        nombre:           p.nombre_producto,
        imagen:           p.imagenes?.[0],
        precio_normal:    p.precio_normal,
        precio_promocion: p.precio_oferta,
      }));

      const total = flash.length + liquidacionMapped.length +
                    ganchoMapped.length + masVendidosMapped.length;

      return res.json({
        total,
        flash,
        liquidacion:  liquidacionMapped,
        gancho:       ganchoMapped,
        mas_vendidos: masVendidosMapped,
      });

    } catch (e) {
      console.error('Error en getPromociones:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Perfil PÚBLICO de la tienda (de cara al cliente) ──────────────────────
  // Devuelve solo datos seguros + productos publicados + stats + reseñas.
  // NUNCA exponer aquí: RUC, DNI, direcciones, datos bancarios, email, whatsapp.
  async getTienda(req, res) {
    const { id } = req.params;
    console.log('🏪 Buscando tienda:', id);
    try {
      const { data: tienda, error } = await supabase
        .from('tiendas')
        .select(`
          id, nombre_tienda, logo_url, portada_url,
          tienda_verificada, es_vendedor_oro, ofrece_garantia,
          fecha_inicio, likes
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('❌ Error tienda:', error.message);
        return res.status(500).json({ error: error.message });
      }

      // Productos publicados de la tienda
      const { data: productos, error: errorProductos } = await supabase
        .from('productos')
        .select(`
          id, nombre_producto, precio_normal, precio_oferta,
          imagenes, calificacion_promedio, stock_disponible,
          tienda_id, tiempo_garantia
        `)
        .eq('tienda_id', id)
        .eq('estado_aprobacion', 'publicado')
        .eq('es_combo', false);

      if (errorProductos) console.error('❌ Error productos:', errorProductos.message);

      const listaProductos = productos ?? [];
      const productoIds    = listaProductos.map(p => p.id);

      // ── Reseñas de todos los productos de la tienda ──
      let resenas       = [];
      let totalResenas  = 0;
      let ratingTienda  = 0;

      if (productoIds.length > 0) {
        const { data: resenasData } = await supabase
          .from('resenas')
          .select('id, producto_id, usuario_id, calificacion, comentario, imagenes, fecha_creacion, usuarios(nombre_completo)')
          .in('producto_id', productoIds)
          .order('fecha_creacion', { ascending: false });

        const todas = resenasData ?? [];
        totalResenas = todas.length;
        if (totalResenas > 0) {
          ratingTienda = todas.reduce(
            (s, r) => s + (parseFloat(r.calificacion) || 0), 0
          ) / totalResenas;
        }
        // Nombre del producto en cada reseña (para mostrarlo en la tab)
        const mapaNombres = {};
        listaProductos.forEach(p => { mapaNombres[p.id] = p.nombre_producto; });
        // Solo las 20 más recientes viajan al cliente
        resenas = todas.slice(0, 20).map(r => ({
          ...r,
          nombre_producto: mapaNombres[r.producto_id] ?? null,
        }));
      }

      // ── Total de unidades vendidas (pedidos entregados) ──
      let totalVentas = 0;
      if (productoIds.length > 0) {
        const { data: vendidos } = await supabase
          .from('detalle_pedidos')
          .select('cantidad, producto_id, pedidos!inner(estado_pedido)')
          .in('producto_id', productoIds)
          .eq('pedidos.estado_pedido', 'entregado');

        totalVentas = (vendidos ?? []).reduce(
          (s, d) => s + (parseInt(d.cantidad) || 0), 0
        );
      }

      const fechaInicio = tienda.fecha_inicio
        ? new Date(tienda.fecha_inicio) : new Date();
      const aniosVendiendo = Math.floor(
        (new Date() - fechaInicio) / (1000 * 60 * 60 * 24 * 365)
      );

      return res.json({
        ...tienda,
        anios_vendiendo: aniosVendiendo,
        productos:       listaProductos,
        resenas,
        stats: {
          total_productos:       listaProductos.length,
          total_resenas:         totalResenas,
          calificacion_promedio: parseFloat(ratingTienda.toFixed(1)),
          total_ventas:          totalVentas,
        },
      });
    } catch (e) {
      console.error('🚨 Error getTienda:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

};

module.exports = shopController;