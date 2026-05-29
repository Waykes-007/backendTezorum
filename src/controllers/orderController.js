const supabase = require('../config/supabase');
const { enviarTicketCompra, enviarCorreoVendedorConRotulo } = require('./emailController');

// ── Generar código de pedido TZ-2026-000145 ──────────────────────────────────
const generarCodigoPedido = (numeroPedido, fecha) => {
  const anio = new Date(fecha).getFullYear();
  const numero = String(numeroPedido).padStart(6, '0');
  return `TZ-${anio}-${numero}`;
};

// ── Generar letra del subpedido (1=A, 2=B, etc.) ────────────────────────────
const letraSubpedido = (index) => String.fromCharCode(65 + index);

const orderController = {
  async crearPedido(req, res) {
    console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));

    const {
      usuario_id,
      monto_total_pagar,
      monto_subtotal,
      costo_envio,
      datos_entrega = {},
      tipo_envio,
      cupon_usado,
      pago = null,
    } = req.body;

    try {
      if (!datos_entrega.direccion) {
        return res.status(400).json({ error: 'Falta la dirección de entrega' });
      }

      // ── 1. Leer carrito ──────────────────────────────────────────────────
      const { data: itemsCarrito, error: errCart } = await supabase
        .from('carrito')
        .select('producto_id, cantidad, productos(id, nombre_producto, precio_normal, precio_oferta, tienda_id, tiendas(id, nombre_tienda, email))')
        .eq('usuario_id', usuario_id);

      if (errCart || !itemsCarrito?.length) {
        throw new Error('Carrito vacío o error al validar');
      }

      // ── 2. Buscar ofertas flash activas ──────────────────────────────────
      const productoIds = itemsCarrito.map(i => i.producto_id);
      const { data: ofertasActivas } = await supabase
        .from('ofertas_flash')
        .select('id, activa, tipo_limite, valor_limite, usos_actuales, precio_oferta, producto_id')
        .eq('activa', true)
        .in('producto_id', productoIds);

      const ahora = new Date();
      const mapaOfertas = {};
      for (const oferta of (ofertasActivas ?? [])) {
        if (oferta.tipo_limite === 'tiempo' && new Date(oferta.valor_limite) < ahora) continue;
        if (oferta.tipo_limite === 'cantidad' &&
            parseInt(oferta.usos_actuales) >= parseInt(oferta.valor_limite)) continue;
        mapaOfertas[oferta.producto_id] = oferta;
      }

      // ── 3. Calcular subtotal real ────────────────────────────────────────
      let subtotalCalculado = 0;
      for (const item of itemsCarrito) {
        const oferta = mapaOfertas[item.producto_id];
        const precio = oferta
          ? parseFloat(oferta.precio_oferta)
          : parseFloat(item.productos.precio_oferta || item.productos.precio_normal);
        subtotalCalculado += precio * parseInt(item.cantidad);
      }

      const subtotalCliente = parseFloat(monto_subtotal);
      if (Math.abs(subtotalCalculado - subtotalCliente) > 1) {
        return res.status(400).json({
          error: 'El monto del pedido no coincide. Refresca el carrito e intenta de nuevo.',
        });
      }

      // ── 4. Actualizar perfil del usuario ─────────────────────────────────
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

      // ── 5. Primera oferta válida ─────────────────────────────────────────
      const primeraOferta = Object.values(mapaOfertas)[0] ?? null;

      // ── 6. Obtener zona de Lima ──────────────────────────────────────────
      let zonaEnvio = 'LIMA';
      if (datos_entrega.distrito_id) {
        const { data: zonaData } = await supabase
          .from('zonas_lima')
          .select('zona')
          .eq('distrito_id', datos_entrega.distrito_id)
          .single();
        if (zonaData) zonaEnvio = zonaData.zona;
      }

      // ── 7. Obtener nombre del distrito ───────────────────────────────────
      let nombreDistrito = datos_entrega.distrito ?? '';
      if (datos_entrega.distrito_id) {
        const { data: distData } = await supabase
          .from('distritos')
          .select('distrito')
          .eq('id', datos_entrega.distrito_id)
          .single();
        if (distData) nombreDistrito = distData.distrito;
      }

      // ── 8. Insertar pedido ───────────────────────────────────────────────
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
          nombre_destinatario:   datos_entrega.nombre,
          tipo_envio,
          cupon_usado:           cupon_usado ?? null,
          estado_pedido:         pago?.estado === 'aprobado' ? 'pagado' : 'pendiente',
          oferta_flash_id:       primeraOferta?.id ?? null,
          precio_flash_aplicado: primeraOferta ? parseFloat(primeraOferta.precio_oferta) : null,
          zona_envio:            zonaEnvio,
          codigo_pedido:         null, // se actualiza abajo
        }])
        .select()
        .single();

      if (errOrder) throw errOrder;

      // ── 9. Generar y guardar código de pedido ────────────────────────────
      const codigoPedido = generarCodigoPedido(pedidoInsertado.numero_pedido, pedidoInsertado.fecha_pedido);
      await supabase
        .from('pedidos')
        .update({ codigo_pedido: codigoPedido })
        .eq('id', pedidoInsertado.id);
      pedidoInsertado.codigo_pedido = codigoPedido;

      // ── 10. Insertar detalle del pedido ──────────────────────────────────
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

      // ── 11. Descontar stock ──────────────────────────────────────────────
      for (const item of itemsCarrito) {
        await supabase.rpc('decrementar_stock', {
          p_producto_id: item.producto_id,
          p_cantidad:    parseInt(item.cantidad),
        });
      }

      // ── 12. Quemar cupón ─────────────────────────────────────────────────
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

      // ── 13. Incrementar usos ofertas ─────────────────────────────────────
      for (const oferta of Object.values(mapaOfertas)) {
        await supabase.rpc('incrementar_uso_oferta', { row_id: oferta.id });
      }

      // ── 14. Limpiar carrito ──────────────────────────────────────────────
      await supabase.from('carrito').delete().eq('usuario_id', usuario_id);

      // ── 15. Agrupar items por tienda ─────────────────────────────────────
      const itemsPorTienda = {};
      for (const item of itemsCarrito) {
        const tiendaId = item.productos.tienda_id;
        const tienda   = item.productos.tiendas;
        if (!itemsPorTienda[tiendaId]) {
          itemsPorTienda[tiendaId] = { tienda, tiendaId, items: [] };
        }
        const oferta = mapaOfertas[item.producto_id];
        const precio = oferta
          ? parseFloat(oferta.precio_oferta)
          : parseFloat(item.productos.precio_oferta || item.productos.precio_normal);
        itemsPorTienda[tiendaId].items.push({
          nombre:   item.productos.nombre_producto,
          cantidad: item.cantidad,
          precio,
        });
      }

      const tiendasArray  = Object.values(itemsPorTienda);
      const totalPaquetes = tiendasArray.length;

      // ── 16. Crear subpedidos + notificaciones + correos por tienda ───────
      for (let i = 0; i < tiendasArray.length; i++) {
        const { tienda, tiendaId, items } = tiendasArray[i];
        const letra          = letraSubpedido(i);
        const codigoSub      = `${codigoPedido}-${letra}`;
        const paqueteNumero  = i + 1;

        // Insertar subpedido
        const { data: subpedido } = await supabase
          .from('subpedidos')
          .insert([{
            pedido_id:       pedidoInsertado.id,
            tienda_id:       tiendaId,
            codigo_subpedido: codigoSub,
            letra,
            paquete_numero:  paqueteNumero,
            total_paquetes:  totalPaquetes,
            estado:          'pendiente_entrega_almacen',
          }])
          .select()
          .single();

        // Notificación al vendedor
        const itemsResumen = items.map(it => `${it.cantidad}x ${it.nombre}`).join(', ');
        await supabase.from('notificaciones').insert([{
          tienda_id: tiendaId,
          tipo:      'venta',
          titulo:    '🎉 ¡Vendiste!',
          mensaje:   `Nueva venta por S/ ${monto_total_pagar}. Productos: ${itemsResumen}`,
          datos: {
            pedido_id:      pedidoInsertado.id,
            codigo_pedido:  codigoPedido,
            codigo_subpedido: codigoSub,
            total:          monto_total_pagar,
            items:          itemsResumen,
            direccion:      datos_entrega.direccion,
            whatsapp:       datos_entrega.whatsapp,
            nombre:         datos_entrega.nombre,
          },
        }]);

        // Correo al vendedor con rótulo PDF
        if (tienda?.email) {
          await enviarCorreoVendedorConRotulo({
            tienda,
            pedido:          pedidoInsertado,
            codigoPedido,
            codigoSubpedido: codigoSub,
            paqueteNumero,
            totalPaquetes,
            zona:            zonaEnvio,
            distrito:        nombreDistrito,
            items,
            datosEntrega:    datos_entrega,
          });
        }
      }

      // ── 17. Registrar pago ───────────────────────────────────────────────
      if (pago) {
        await supabase.from('pagos').insert([{
          pedido_id:         pedidoInsertado.id,
          usuario_id,
          estado:            pago.estado ?? 'pendiente',
          monto:             monto_total_pagar,
          mp_payment_id:     pago.mp_payment_id ?? null,
          mp_preference_id:  pago.mp_preference_id ?? null,
          mp_status:         pago.mp_status ?? null,
          mp_status_detail:  pago.mp_status_detail ?? null,
          metodo_pago:       pago.metodo_pago ?? null,
          tipo_pago:         pago.tipo_pago ?? null,
          banco:             pago.banco ?? null,
          ultimos_4_digitos: pago.ultimos_4_digitos ?? null,
          nombre_titular:    pago.nombre_titular ?? null,
          fecha_aprobacion:  pago.estado === 'aprobado' ? new Date() : null,
        }]);
      }

      // ── 18. Ticket al cliente ────────────────────────────────────────────
      const { data: usuarioData } = await supabase
        .from('usuarios')
        .select('correo_electronico')
        .eq('id', usuario_id)
        .single();

      await enviarTicketCompra({
        pedido: {
          id:                pedidoInsertado.id,
          numero:            codigoPedido,
          monto_total_pagar: pedidoInsertado.monto_total_pagar,
          costo_envio:       pedidoInsertado.costo_envio,
          direccion_envio:   datos_entrega.direccion,
        },
        cliente: {
          nombre:   datos_entrega.nombre,
          correo:   usuarioData?.correo_electronico,
          whatsapp: datos_entrega.whatsapp,
          dni:      datos_entrega.dni,
        },
        items: detallesData.map(item => {
          const prod = itemsCarrito.find(i => i.producto_id === item.producto_id);
          return {
            nombre:   prod?.productos?.nombre_producto ?? 'Producto',
            cantidad: item.cantidad,
            precio:   item.precio_unitario_historico,
          };
        }),
        pago: pago ?? null,
      });

      return res.status(201).json({
        message:  'Pedido registrado con éxito ✅',
        pedidoId: pedidoInsertado.id,
        numero:   codigoPedido,
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