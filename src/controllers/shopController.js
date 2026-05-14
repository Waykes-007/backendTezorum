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
        .eq('estado_aprobacion', 'publicado');

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

      const { data: productos, error: errorProductos } = await supabase
        .from('productos')
        .select(`
          id, nombre_producto, precio_normal, precio_oferta,
          imagenes, calificacion_promedio, stock_disponible
        `)
        .eq('tienda_id', id)
        .eq('estado_aprobacion', 'publicado');

      console.log('📦 Productos encontrados:', productos?.length);
      console.log('❌ Error productos:', errorProductos?.message);

      const fechaInicio = tienda.fecha_inicio
        ? new Date(tienda.fecha_inicio) : new Date();
      const aniosVendiendo = Math.floor(
        (new Date() - fechaInicio) / (1000 * 60 * 60 * 24 * 365)
      );

      return res.json({
        ...tienda,
        anios_vendiendo: aniosVendiendo,
        productos: productos ?? [],
      });
    } catch (e) {
      console.error('🚨 Error getTienda:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

};

module.exports = shopController;