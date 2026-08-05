const supabase = require('../config/supabase');
const { cotizarEnvio, esCuponEnvioAplicable, aplicarCuponEnvio } = require('./cotizadorEnvio');

const shippingController = {
  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/cotizar-envio
  // body: {
  //   items: [{ producto_id, cantidad }],   // requerido
  //   tiene_cupon_producto?: boolean         // ¿el carrito ya usa un cupón de producto?
  // }
  // Respuesta:
  //   { ok, envio, cupon_envio: { aplica, ... } }
  // El cliente muestra `envio` (o `envio_final` si aplica el cupón) y, si aplica,
  // guarda `cupon_envio_id` para mandarlo al checkout. NO debe mostrar el
  // excedente como "aumento por peso": solo el total del envío.
  // ───────────────────────────────────────────────────────────────────────────
  async cotizarEnvioCarrito(req, res) {
    try {
      const { items = [], tiene_cupon_producto = false } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ ok: false, error: 'Carrito vacío' });
      }

      const ids = items.map(i => i.producto_id).filter(Boolean);
      const { data: productos, error } = await supabase
        .from('productos')
        .select('id, precio_normal, precio_oferta, tienda_id, peso_kg, largo_cm, ancho_cm, alto_cm, tiendas(user_id)')
        .in('id', ids);
      if (error) throw new Error(error.message);

      const mapa = {};
      for (const p of (productos ?? [])) mapa[p.id] = p;

      // 1. Cotizar envío (peso facturable = suma de max(peso, volumétrico) * cantidad)
      const itemsEnvio = items.map(i => ({
        producto: mapa[i.producto_id] ?? {},
        cantidad: i.cantidad,
      }));
      const cotizacion = cotizarEnvio(itemsEnvio);

      // 2. Subtotal para la compra mínima (precio_oferta ?? precio_normal).
      //    Es solo para la vista previa; el checkout revalida con su propio
      //    subtotal (que sí considera ofertas flash).
      let subtotal = 0;
      for (const i of items) {
        const p = mapa[i.producto_id];
        if (!p) continue;
        const precio = parseFloat(p.precio_oferta ?? p.precio_normal ?? 0);
        subtotal += precio * (parseInt(i.cantidad) || 0);
      }
      subtotal = Math.round(subtotal * 100) / 100;

      // 3. ¿Carrito de un solo vendedor? (por vendedor = tiendas.user_id)
      const vendedores = new Set(
        items.map(i => mapa[i.producto_id]?.tiendas?.user_id).filter(Boolean)
      );
      const unicoVendedor = vendedores.size === 1;
      const vendedorId = unicoVendedor ? [...vendedores][0] : null;

      // 4. Cupón de envío activo del vendedor
      let cuponEnvio = null;
      if (unicoVendedor && vendedorId) {
        const { data: filas } = await supabase
          .from('cupones_envio_vendedor')
          .select('*')
          .eq('vendedor_id', vendedorId)
          .eq('activo', true)
          .limit(1);
        cuponEnvio = (filas ?? [])[0] ?? null;
      }

      const elegibilidad = esCuponEnvioAplicable(cuponEnvio, {
        unicoVendedor,
        subtotal,
        tieneCuponProducto: !!tiene_cupon_producto,
      });

      // 5. Armar respuesta
      if (cuponEnvio && elegibilidad.aplica) {
        const r = aplicarCuponEnvio(cotizacion, cuponEnvio.descuento);
        return res.json({
          ok: true,
          envio: cotizacion.envioTotal, // sin descuento
          cupon_envio: {
            aplica: true,
            cupon_envio_id: cuponEnvio.id,
            nombre: cuponEnvio.nombre ?? null,
            descuento: r.descuento_cupon,        // lo que resta el cupón
            envio_final: r.envio_cobrado_cliente, // lo que paga el cliente
            ahorro: Math.round((cotizacion.envioTotal - r.envio_cobrado_cliente) * 100) / 100,
          },
        });
      }

      return res.json({
        ok: true,
        envio: cotizacion.envioTotal,
        cupon_envio: { aplica: false, motivo: elegibilidad.motivo },
      });
    } catch (e) {
      console.error('🚨 cotizarEnvioCarrito:', e.message);
      return res.status(500).json({ ok: false, error: e.message });
    }
  },
};

module.exports = shippingController;