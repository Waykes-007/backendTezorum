const supabase = require('../config/supabase');

const cartController = {

  // ── Agregar o actualizar cantidad ──────────────────────────
  async agregarAlCarrito(req, res) {
    const { usuario_id, producto_id, cantidad } = req.body;
    try {
      const { data, error } = await supabase
        .from('carrito')
        .upsert(
          { usuario_id, producto_id, cantidad },
          { onConflict: 'usuario_id, producto_id' }
        );
      if (error) throw error;
      res.status(200).json({ message: 'Producto guardado en la nube' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  // ── Obtener carrito con precio correcto en tiempo real ─────
  async obtenerCarrito(req, res) {
    const { userId } = req.params;
    try {
      // 1. Traer items del carrito — incluir tienda_id y tiendas
      const { data, error } = await supabase
        .from('carrito')
        .select(`
          id,
          cantidad,
          producto_id,
          productos (
            id,
            nombre_producto,
            precio_normal,
            precio_oferta,
            precio_flash,
            imagenes,
            tienda_id,
            tiendas (
              id,
              nombre_tienda,
              email
            )
          )
        `)
        .eq('usuario_id', userId);

      if (error) throw error;

      // 2. Verificar qué productos tienen oferta flash activa y vigente
      const productoIds = data.map(i => i.productos?.id).filter(Boolean);

      const ahora = new Date().toISOString();
      const { data: ofertas } = await supabase
        .from('ofertas_flash')
        .select('producto_id, precio_oferta, tipo_limite, valor_limite, usos_actuales')
        .eq('activa', true)
        .in('producto_id', productoIds);

      // 3. Mapa productoId → precio flash solo si sigue vigente AHORA
      const mapaFlash = {};
      for (const oferta of (ofertas ?? [])) {
        let vigente = true;
        if (oferta.tipo_limite === 'tiempo' && oferta.valor_limite < ahora) {
          vigente = false;
        }
        if (oferta.tipo_limite === 'cantidad' &&
            parseInt(oferta.usos_actuales) >= parseInt(oferta.valor_limite)) {
          vigente = false;
        }
        if (vigente) {
          mapaFlash[oferta.producto_id] = parseFloat(oferta.precio_oferta);
        }
      }

      // 4. Formatear con jerarquía de precios correcta:
      //    flash vigente > precio_oferta permanente > precio_normal
      const carritoFormateado = data.map(item => {
        const prod         = item.productos;
        const flashVigente = mapaFlash[prod?.id];

        let precioFinal;
        let tieneFlash = false;

        if (flashVigente !== undefined) {
          precioFinal = flashVigente;
          tieneFlash  = true;
        } else if (prod?.precio_oferta != null) {
          precioFinal = parseFloat(prod.precio_oferta);
        } else {
          precioFinal = parseFloat(prod?.precio_normal ?? 0);
        }

        return {
          id:          item.id,
          cantidad:    item.cantidad,
          producto_id: item.producto_id ?? prod?.id, // ← campo raíz para el orderController
          productos: {
            ...prod,
            precio_final:       precioFinal,
            tiene_oferta_flash: tieneFlash,
            // tienda_id y tiendas ya vienen en ...prod gracias al select
          },
        };
      });

      res.status(200).json(carritoFormateado);
    } catch (e) {
      console.error('Error en obtenerCarrito:', e.message);
      res.status(500).json({ error: e.message });
    }
  },

  // ── Eliminar producto del carrito ──────────────────────────
  async eliminarDelCarrito(req, res) {
    const { userId, productoId } = req.params;
    try {
      const { error } = await supabase
        .from('carrito')
        .delete()
        .eq('usuario_id', userId)
        .eq('producto_id', productoId);

      if (error) throw error;
      res.status(200).json({ message: 'Producto eliminado con éxito' });
    } catch (e) {
      console.error('Error al eliminar:', e.message);
      res.status(500).json({ error: e.message });
    }
  },
};

module.exports = cartController;