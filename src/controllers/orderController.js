const supabase = require('../config/supabase');
const { enviarTicketCompra } = require('./emailController');

const orderController = {
  async crearPedido(req, res) {
    console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));
    console.log('🆕 NUEVO orderController activo');
    console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));

    const {
      usuario_id,
      monto_total_pagar,
      monto_subtotal,
      costo_envio,
      datos_entrega = {},
      tipo_envio,
      cupon_usado,
      // oferta_flash_id y precio_flash_aplicado del cliente se IGNORAN
      // El backend los busca por sí mismo
    } = req.body;

    try {
      if (!datos_entrega.direccion) {
        return res.status(400).json({ error: 'Falta la dirección de entrega' });
      }

      // ── 1. Leer carrito desde la BD (nunca confiar en el cliente) ──────────
      const { data: itemsCarrito, error: errCart } = await supabase
        .from('carrito')
        .select('producto_id, cantidad, productos(id, precio_normal, precio_oferta)')
        .eq('usuario_id', usuario_id);

      if (errCart || !itemsCarrito?.length) {
        throw new Error('Carrito vacío o error al validar');
      }

      // ── 2. El backend busca las ofertas flash activas por sí mismo ─────────
      // No depende de lo que mande el cliente — consulta la BD en este momento
      const productoIds = itemsCarrito.map(i => i.producto_id);

      const { data: ofertasActivas } = await supabase
        .from('ofertas_flash')
        .select('id, activa, tipo_limite, valor_limite, usos_actuales, precio_oferta, producto_id')
        .eq('activa', true)
        .in('producto_id', productoIds);

      const ahora = new Date();

      // Construir mapa productoId → oferta válida en este instante
      const mapaOfertas = {};
      for (const oferta of (ofertasActivas ?? [])) {
        // Verificar que no expiró por tiempo
        if (oferta.tipo_limite === 'tiempo' && new Date(oferta.valor_limite) < ahora) {
          console.log(`⏰ Oferta ${oferta.id} expiró — ignorada`);
          continue;
        }
        // Verificar que no se agotó por cantidad
        if (oferta.tipo_limite === 'cantidad' &&
            parseInt(oferta.usos_actuales) >= parseInt(oferta.valor_limite)) {
          console.log(`🚫 Oferta ${oferta.id} agotada — ignorada`);
          continue;
        }
        // Válida — guardar en el mapa
        mapaOfertas[oferta.producto_id] = oferta;
      }

      console.log(`✅ Ofertas válidas encontradas: ${Object.keys(mapaOfertas).length}`);

      // ── 3. Calcular subtotal real en el backend ────────────────────────────
      let subtotalCalculado = 0;
      for (const item of itemsCarrito) {
        const oferta = mapaOfertas[item.producto_id];
        const precio = oferta
          ? parseFloat(oferta.precio_oferta)
          : parseFloat(item.productos.precio_oferta || item.productos.precio_normal);
        subtotalCalculado += precio * parseInt(item.cantidad);
      }

      // Tolerancia ±1 sol por redondeos del frontend
      const subtotalCliente = parseFloat(monto_subtotal);
      if (Math.abs(subtotalCalculado - subtotalCliente) > 1) {
        console.warn(`⚠️ Subtotal manipulado — cliente: ${subtotalCliente}, real: ${subtotalCalculado}`);
        return res.status(400).json({
          error: 'El monto del pedido no coincide. Refresca el carrito e intenta de nuevo.',
        });
      }

      // ── 4. Actualizar perfil del usuario ───────────────────────────────────
      await supabase
        .from('usuarios')
        .update({
          nombre_completo:      datos_entrega.nombre,
          dni_ruc:              datos_entrega.dni,
          telefono:             datos_entrega.whatsapp,
          direccion_referencia: datos_entrega.direccion,
          distrito:             datos_entrega.distrito ?? null,
        })
        .eq('id', usuario_id);

      // ── 5. Tomar la primera oferta válida para registrarla en el pedido ────
      const primeraOferta = Object.values(mapaOfertas)[0] ?? null;

      // ── 6. Insertar pedido ─────────────────────────────────────────────────
      const { data: pedidoInsertado, error: errOrder } = await supabase
        .from('pedidos')
        .insert([{
          usuario_id,
          monto_total_pagar,
          monto_subtotal:        subtotalCalculado,
          costo_envio,
          direccion_envio:       datos_entrega.direccion,
          departamento_id:       datos_entrega.departamento_id ?? null,
          provincia_id:          datos_entrega.provincia_id ?? null,
          distrito_id:           datos_entrega.distrito_id ?? null,
          referencia_envio:      datos_entrega.referencia ?? null,
          whatsapp_contacto:     datos_entrega.whatsapp,
          dni_ruc_comprobante:   datos_entrega.dni,
          tipo_envio,
          cupon_usado:           cupon_usado ?? null,
          estado_pedido:         'pendiente',
          oferta_flash_id:       primeraOferta?.id ?? null,
          precio_flash_aplicado: primeraOferta ? parseFloat(primeraOferta.precio_oferta) : null,
        }])
        .select()
        .single();

      if (errOrder) throw errOrder;

      // ── 7. Insertar detalle del pedido con precio calculado en backend ─────
      const detallesData = itemsCarrito.map(item => {
        const oferta = mapaOfertas[item.producto_id];
        const precioUsado = oferta
          ? parseFloat(oferta.precio_oferta)
          : parseFloat(item.productos.precio_oferta || item.productos.precio_normal);

        return {
          pedido_id:                 pedidoInsertado.id,
          producto_id:               item.producto_id,
          cantidad:                  item.cantidad,
          precio_unitario_historico: precioUsado,
          subtotal_item:             precioUsado * parseInt(item.cantidad),
        };
      });

      const { error: errDetalle } = await supabase
        .from('detalle_pedidos')
        .insert(detallesData);

      if (errDetalle) throw errDetalle;
      // ── 7.5 Descontar stock de cada producto ──────────────────────────────
      for (const item of itemsCarrito) {
        const { error: stockErr } = await supabase.rpc('decrementar_stock', {
          p_producto_id: item.producto_id,
          p_cantidad:    parseInt(item.cantidad),
        });
        if (stockErr) {
          console.error(`⚠️ Error al descontar stock de ${item.producto_id}:`, stockErr.message);
        } else {
          console.log(`✅ Stock descontado — producto ${item.producto_id}, cantidad ${item.cantidad}`);
        }
      }

      // ── 8. Quemar cupón (si aplica) ────────────────────────────────────────
      if (cupon_usado) {
        const { data: cuponData } = await supabase
          .from('cupones')
          .select('id, usos_actuales')
          .eq('codigo', cupon_usado.trim().toUpperCase())
          .single();

        if (cuponData) {
          await supabase
            .from('cupones')
            .update({ usos_actuales: cuponData.usos_actuales + 1 })
            .eq('id', cuponData.id);
        }
      }

      // ── 9. Incrementar usos de todas las ofertas aplicadas ─────────────────
      for (const oferta of Object.values(mapaOfertas)) {
        const { error: usoErr } = await supabase.rpc('incrementar_uso_oferta', {
          row_id: oferta.id,
        });
        if (usoErr) {
          console.error(`⚠️ Error RPC oferta ${oferta.id}:`, usoErr.message);
        } else {
          console.log(`✅ Uso incrementado — oferta ${oferta.id}`);
        }
      }

      // ── 10. Limpiar carrito ────────────────────────────────────────────────
      await supabase.from('carrito').delete().eq('usuario_id', usuario_id);

      // ── 11. Obtener correo del usuario ─────────────────────────────────────
      const { data: usuarioData } = await supabase
        .from('usuarios')
        .select('correo_electronico')
        .eq('id', usuario_id)
        .single();

      // ── 12. Enviar ticket de compra por correo ─────────────────────────────
      await enviarTicketCompra({
        pedido: {
          id:                pedidoInsertado.id,
          numero:            pedidoInsertado.id.slice(0, 8).toUpperCase(),
          monto_total_pagar: pedidoInsertado.monto_total_pagar,
          costo_envio:       pedidoInsertado.costo_envio,
          direccion_envio:   datos_entrega.direccion,
        },
        cliente: {
          nombre:   datos_entrega.nombre,
          correo:   usuarioData?.correo_electronico,
          whatsapp: datos_entrega.whatsapp,
        },
        items: detallesData.map(item => {
          const prod = itemsCarrito.find(i => i.producto_id === item.producto_id);
          return {
            nombre:   prod?.productos?.nombre_producto ?? 'Producto',
            cantidad: item.cantidad,
            precio:   item.precio_unitario_historico,
          };
        }),
      });

      return res.status(201).json({
        message: 'Pedido registrado con éxito ✅',
        pedidoId: pedidoInsertado.id,
      });

    } catch (e) {
      console.error('🚨 Error crearPedido:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },
  

  async obtenerPedidosPorUsuario(req, res) {
    const { userId } = req.params;
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .eq('usuario_id', userId)
        .order('fecha_pedido', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
};

module.exports = orderController;