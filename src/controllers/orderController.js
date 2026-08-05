const supabase = require('../config/supabase');
const { enviarTicketCompra, enviarCorreoVendedorConRotulo } = require('./emailController');
const { cotizarEnvio, esCuponEnvioAplicable, aplicarCuponEnvio } = require('./cotizadorEnvio');

const generarCodigoPedido = (numeroPedido, fecha) => {
  const anio   = new Date(fecha).getFullYear();
  const numero = String(numeroPedido).padStart(6, '0');
  return `TZ-${anio}-${numero}`;
};

const letraSubpedido = (index) => String.fromCharCode(65 + index);

const orderController = {
  async crearPedido(req, res) {
    console.log('🔥 VERSION V5 ACTIVA 🔥'); // ← agrega esta línea
    console.log('📦 crearPedido iniciado');

    const {
      usuario_id,
      monto_total_pagar,
      monto_subtotal,
      costo_envio,
      datos_entrega = {},
      tipo_envio,
      cupon_usado,
      cupon_envio_id = null,
      pago = null,
      itemsCarrito: itemsCarritoGuardados = null,
    } = req.body;

    try {
      if (!datos_entrega.direccion) {
        return res.status(400).json({ error: 'Falta la dirección de entrega' });
      }

      // ── 1. Usar items guardados o leer del carrito ─────────────────────────
      let itemsCarrito = itemsCarritoGuardados;

      if (!itemsCarrito || itemsCarrito.length === 0) {
        console.log('🛒 Leyendo carrito para usuario:', usuario_id);
        const { data, error: errCart } = await supabase
          .from('carrito')
          .select('producto_id, cantidad, productos(id, nombre_producto, precio_normal, precio_oferta, tienda_id, tiendas(id, nombre_tienda, email))')
          .eq('usuario_id', usuario_id);

        if (errCart) {
          console.warn('⚠️ Error leyendo carrito:', errCart.message);
        }
        itemsCarrito = data ?? [];
        console.log(`🛒 Items del carrito: ${itemsCarrito.length}`);
      } else {
        console.log(`✅ Usando ${itemsCarrito.length} items guardados del token`);
      }

      // ── 1.5 Datos de envío por producto (peso/medidas + vendedor) ─────────
      const idsEnvio = itemsCarrito
        .map(i => i.producto_id ?? i.productos?.id)
        .filter(Boolean);
      const mapaEnvioProd = {};
      if (idsEnvio.length > 0) {
        const { data: prodEnvio } = await supabase
          .from('productos')
          .select('id, tienda_id, peso_kg, largo_cm, ancho_cm, alto_cm, tiendas(user_id)')
          .in('id', idsEnvio);
        for (const p of (prodEnvio ?? [])) {
          mapaEnvioProd[p.id] = {
            peso_kg:     p.peso_kg,
            largo_cm:    p.largo_cm,
            ancho_cm:    p.ancho_cm,
            alto_cm:     p.alto_cm,
            tienda_id:   p.tienda_id,
            vendedor_id: p.tiendas?.user_id ?? null,
          };
        }
      }

      // ── 2. Buscar ofertas flash activas ───────────────────────────────────
      const mapaOfertas = {};
      if (itemsCarrito.length > 0) {
        const productoIds = itemsCarrito.map(i => i.producto_id);
        const { data: ofertasActivas } = await supabase
          .from('ofertas_flash')
          .select('id, activa, tipo_limite, valor_limite, usos_actuales, precio_oferta, producto_id')
          .eq('activa', true)
          .in('producto_id', productoIds);

        const ahora = new Date();
        for (const oferta of (ofertasActivas ?? [])) {
          if (oferta.tipo_limite === 'tiempo' && new Date(oferta.valor_limite) < ahora) continue;
          if (oferta.tipo_limite === 'cantidad' &&
              parseInt(oferta.usos_actuales) >= parseInt(oferta.valor_limite)) continue;
          mapaOfertas[oferta.producto_id] = oferta;
        }
      }

      // ── 3. Calcular y validar subtotal ────────────────────────────────────
      // Si no hay items (carrito vacío), confiamos en el monto de Izipay
      let subtotalCalculado = parseFloat(monto_total_pagar);

      if (itemsCarrito.length > 0) {
        subtotalCalculado = 0;
        for (const item of itemsCarrito) {
          const oferta = mapaOfertas[item.producto_id];
          const precio = oferta
            ? parseFloat(oferta.precio_oferta)
            : parseFloat(item.productos?.precio_oferta || item.productos?.precio_normal || 0);
          subtotalCalculado += precio * parseInt(item.cantidad);
        }

        console.log(`💰 Subtotal calculado: ${subtotalCalculado} | Enviado: ${monto_subtotal}`);

        const subtotalCliente = parseFloat(monto_subtotal);
        const montoTotal      = parseFloat(monto_total_pagar);
        if (Math.abs(subtotalCalculado - subtotalCliente) > 1 &&
            Math.abs(subtotalCalculado - montoTotal) > 1) {
          console.error(`❌ Monto no coincide: calculado=${subtotalCalculado} subtotal=${subtotalCliente} total=${montoTotal}`);
          return res.status(400).json({
            error: 'El monto del pedido no coincide. Refresca el carrito e intenta de nuevo.',
          });
        }
      } else {
        console.log(`💰 Sin items para validar, usando monto de Izipay: ${subtotalCalculado}`);
      }

      // ── 3.7 Cotizar envío + validar cupón de envío del vendedor ───────────
      // Solo registramos subsidio si el cliente aplicó un cupón (cupon_envio_id)
      // y este es válido para el carrito. NO tocamos costo_envio ni
      // monto_total_pagar: eso ya viene calculado y cobrado por el cliente.
      // Aquí solo dejamos registrado el subsidio que Waykes fronta, para
      // recuperarlo en la liquidación del vendedor.
      let subsidioEnvio = null;
      if (cupon_envio_id && itemsCarrito.length > 0) {
        const itemsEnvio = itemsCarrito.map(i => ({
          producto: mapaEnvioProd[i.producto_id ?? i.productos?.id] ?? {},
          cantidad: i.cantidad,
        }));
        const cotizacion = cotizarEnvio(itemsEnvio);

        const vendedores = new Set(
          itemsCarrito
            .map(i => mapaEnvioProd[i.producto_id ?? i.productos?.id]?.vendedor_id)
            .filter(Boolean)
        );
        const tiendasCarrito = new Set(
          itemsCarrito
            .map(i => mapaEnvioProd[i.producto_id ?? i.productos?.id]?.tienda_id)
            .filter(Boolean)
        );
        const unicoVendedor = vendedores.size === 1;
        const vendedorId = unicoVendedor ? [...vendedores][0] : null;
        const tiendaId   = tiendasCarrito.size === 1 ? [...tiendasCarrito][0] : null;

        const { data: cuponEnvioArr } = await supabase
          .from('cupones_envio_vendedor')
          .select('*')
          .eq('id', cupon_envio_id)
          .limit(1);
        const cuponEnvio = (cuponEnvioArr ?? [])[0] ?? null;

        // El cupón debe pertenecer al vendedor del carrito (anti-spoof)
        const perteneceAlVendedor = !!cuponEnvio && cuponEnvio.vendedor_id === vendedorId;

        const elegibilidad = esCuponEnvioAplicable(cuponEnvio, {
          unicoVendedor,
          subtotal: subtotalCalculado,
          tieneCuponProducto: !!cupon_usado,
        });

        if (perteneceAlVendedor && elegibilidad.aplica) {
          const r = aplicarCuponEnvio(cotizacion, cuponEnvio.descuento);
          subsidioEnvio = {
            vendedor_id: vendedorId,
            tienda_id:   tiendaId,
            cupon_id:    cuponEnvio.id,
            ...r, // descuento_cupon, envio_base_referencia, envio_total_sin_descuento,
                  // monto_subsidiado, envio_cobrado_cliente
          };
          const clienteEnvio = parseFloat(costo_envio) || 0;
          if (Math.abs(clienteEnvio - r.envio_cobrado_cliente) > 0.5) {
            console.warn(
              `⚠️ Envío cobrado al cliente (${clienteEnvio}) ≠ calculado en servidor ` +
              `(${r.envio_cobrado_cliente}). Se registra el subsidio del servidor.`
            );
          }
          console.log(`✅ Cupón de envío válido. Subsidio: S/${r.monto_subsidiado}`);
        } else {
          console.warn(
            `⚠️ Cupón de envío ${cupon_envio_id} no aplicable: ` +
            `${!perteneceAlVendedor ? 'no pertenece al vendedor del carrito' : elegibilidad.motivo}. ` +
            `No se registra subsidio.`
          );
        }
      }

      // ── 3.5 VALIDAR Y DESCONTAR STOCK (atómico) ──────────────────────────
      // Antes de crear el pedido: verificar que TODOS los productos
      // tengan stock suficiente. Si uno falla, se bloquea TODA la compra
      // (y se revierte lo ya descontado). Evita condiciones de carrera
      // con la función descontar_stock (UPDATE ... WHERE stock >= cantidad).
      if (itemsCarrito.length > 0) {
        const descontados = []; // para revertir si algo falla
        for (const item of itemsCarrito) {
          const pid = item.producto_id ?? item.productos?.id;
          const cant = parseInt(item.cantidad) || 0;
          if (!pid || cant <= 0) continue;

          const { data: ok, error: errStock } = await supabase
            .rpc('descontar_stock', { p_producto_id: pid, p_cantidad: cant });

          if (errStock || ok !== true) {
            // Revertir lo ya descontado en este pedido
            for (const d of descontados) {
              await supabase.rpc('descontar_stock',
                { p_producto_id: d.pid, p_cantidad: -d.cant });
            }
            const nombre = item.productos?.nombre_producto ?? 'un producto';
            return res.status(409).json({
              error: `Sin stock suficiente para "${nombre}". Otro cliente pudo haberlo comprado. Revisa tu carrito.`,
              sinStock: true,
            });
          }
          descontados.push({ pid, cant });
        }
        console.log(`📉 Stock descontado de ${descontados.length} productos`);
      }

      // ── 4. Actualizar perfil del usuario ──────────────────────────────────
      await supabase.from('usuarios').update({
        nombre_completo:      datos_entrega.nombre,
        dni_ruc:              datos_entrega.dni,
        telefono:             datos_entrega.whatsapp,
        direccion_referencia: datos_entrega.direccion,
        distrito:             datos_entrega.distrito ?? null,
      }).eq('id', usuario_id);

      // ── 5. Primera oferta válida ──────────────────────────────────────────
      const primeraOferta = Object.values(mapaOfertas)[0] ?? null;

      // ── 6. Obtener zona de Lima ───────────────────────────────────────────
      let zonaEnvio = 'LIMA';
      if (datos_entrega.distrito_id) {
        const { data: zonaData } = await supabase
          .from('zonas_lima').select('zona')
          .eq('distrito_id', datos_entrega.distrito_id).single();
        if (zonaData) zonaEnvio = zonaData.zona;
      }

      // ── 7. Obtener nombre del distrito ────────────────────────────────────
      let nombreDistrito = datos_entrega.distrito ?? '';
      if (datos_entrega.distrito_id) {
        const { data: distData } = await supabase
          .from('distritos').select('distrito')
          .eq('id', datos_entrega.distrito_id).single();
        if (distData) nombreDistrito = distData.distrito;
      }
      // ── 7.5 Resolver cupón (id + descuento aplicado) ──────────────────────
      let cuponRow = null;
      if (cupon_usado) {
        const { data: cuponData } = await supabase
          .from('cupones').select('id, usos_actuales')
          .eq('codigo', cupon_usado.trim().toUpperCase()).single();
        if (cuponData) cuponRow = cuponData;
      }
      const descuentoAplicado = cuponRow
        ? Math.max(0, Number(
            (subtotalCalculado + (parseFloat(costo_envio) || 0) - parseFloat(monto_total_pagar)).toFixed(2)
          ))
        : 0;

      // ── 8. Insertar pedido ────────────────────────────────────────────────
      console.log('📝 Insertando pedido...');
      const { data: pedidoInsertado, error: errOrder } = await supabase
        .from('pedidos')
        .insert([{
          usuario_id,
          monto_total_pagar,
          monto_subtotal:        subtotalCalculado,
          costo_envio:           costo_envio ?? 0,
          direccion_envio:       datos_entrega.direccion,
          departamento_id:       datos_entrega.departamento_id ?? null,
          provincia_id:          datos_entrega.provincia_id ?? null,
          distrito_id:           datos_entrega.distrito_id ?? null,
          referencia_envio:      datos_entrega.referencia ?? null,
          whatsapp_contacto:     datos_entrega.whatsapp,
          dni_ruc_comprobante:   datos_entrega.dni,
          nombre_destinatario:   datos_entrega.nombre,
          tipo_envio:            tipo_envio ?? 'Normal',
          cupon_usado:           cupon_usado ?? null,
          cupon_id:              cuponRow?.id ?? null,
          descuento_aplicado:    descuentoAplicado,
          estado_pedido:         pago?.estado === 'aprobado' ? 'pagado' : 'pendiente',
          oferta_flash_id:       primeraOferta?.id ?? null,
          precio_flash_aplicado: primeraOferta ? parseFloat(primeraOferta.precio_oferta) : null,
          zona_envio:            zonaEnvio,
          codigo_pedido:         null,
        }])
        .select().single();

      if (errOrder) throw errOrder;
      console.log('✅ Pedido insertado:', pedidoInsertado.id);

      // ── 9. Generar código de pedido ───────────────────────────────────────
      const codigoPedido = generarCodigoPedido(pedidoInsertado.numero_pedido, pedidoInsertado.fecha_pedido);
      await supabase.from('pedidos').update({ codigo_pedido: codigoPedido }).eq('id', pedidoInsertado.id);
      pedidoInsertado.codigo_pedido = codigoPedido;
      console.log('📋 Código:', codigoPedido);

      // ── 9.5 Registrar subsidio de envío (si aplicó cupón del vendedor) ────
      if (subsidioEnvio) {
        const { error: errSubsidio } = await supabase
          .from('subsidios_envio')
          .insert([{ pedido_id: pedidoInsertado.id, ...subsidioEnvio }]);
        if (errSubsidio) {
          console.error('🚨 Error registrando subsidio de envío:', errSubsidio.message);
        } else {
          console.log(
            `💸 Subsidio registrado: S/${subsidioEnvio.monto_subsidiado} ` +
            `contra vendedor ${subsidioEnvio.vendedor_id}`
          );
        }
      }

      // ── 10. Insertar detalles ─────────────────────────────────────────────
      let detallesData = [];
      if (itemsCarrito.length > 0) {
        detallesData = itemsCarrito.map(item => {
          const oferta = mapaOfertas[item.producto_id];
          const precioUsado = oferta
            ? parseFloat(oferta.precio_oferta)
            : parseFloat(item.productos?.precio_oferta || item.productos?.precio_normal || 0);
          return {
            pedido_id:                 pedidoInsertado.id,
            producto_id:               item.producto_id,
            cantidad:                  item.cantidad,
            precio_unitario_historico: precioUsado,
            subtotal_item:             precioUsado * parseInt(item.cantidad),
          };
        });

        const { error: errDetalle } = await supabase.from('detalle_pedidos').insert(detallesData);
        if (errDetalle) throw errDetalle;
        console.log('✅ Detalles insertados');

        // ── 11. Descontar stock ─────────────────────────────────────────────
        for (const item of itemsCarrito) {
          await supabase.rpc('decrementar_stock', {
            p_producto_id: item.producto_id,
            p_cantidad:    parseInt(item.cantidad),
          });
        }
      }

      // ── 12. Quemar cupón ──────────────────────────────────────────────────
      if (cuponRow) {
        await supabase.from('cupones')
          .update({ usos_actuales: (cuponRow.usos_actuales ?? 0) + 1 })
          .eq('id', cuponRow.id);
      }

      // ── 13. Incrementar usos ofertas ──────────────────────────────────────
      for (const oferta of Object.values(mapaOfertas)) {
        await supabase.rpc('incrementar_uso_oferta', { row_id: oferta.id });
      }

      // ── 14. Limpiar carrito ───────────────────────────────────────────────
      await supabase.from('carrito').delete().eq('usuario_id', usuario_id);
      console.log('🛒 Carrito limpiado');

      // ── 15. Obtener items con tienda via queries separadas ────────────────
      console.log('🏪 Agrupando por tienda...');

      const { data: detallesPedido } = await supabase
        .from('detalle_pedidos')
        .select('producto_id, cantidad, precio_unitario_historico')
        .eq('pedido_id', pedidoInsertado.id);

      const productosIds = (detallesPedido ?? []).map(d => d.producto_id);
      const { data: productosData } = await supabase
        .from('productos')
        .select('id, nombre_producto, tienda_id')
        .in('id', productosIds);

      const tiendaIds = [...new Set((productosData ?? []).map(p => p.tienda_id).filter(Boolean))];
      const { data: tiendasData } = await supabase
        .from('tiendas')
        .select('id, nombre_tienda, email')
        .in('id', tiendaIds);

      const mapaProductos = {};
      for (const p of (productosData ?? [])) mapaProductos[p.id] = p;

      const mapaTiendas = {};
      for (const t of (tiendasData ?? [])) mapaTiendas[t.id] = t;

      const itemsPorTienda = {};
      for (const detalle of (detallesPedido ?? [])) {
        const producto = mapaProductos[detalle.producto_id];
        const tiendaId = producto?.tienda_id;
        const tienda   = mapaTiendas[tiendaId];

        if (!tiendaId || !tienda) {
          console.warn(`⚠️ Sin tienda para producto ${detalle.producto_id}`);
          continue;
        }

        if (!itemsPorTienda[tiendaId]) {
          itemsPorTienda[tiendaId] = { tienda, tiendaId, items: [] };
        }

        itemsPorTienda[tiendaId].items.push({
          nombre:   producto?.nombre_producto,
          cantidad: detalle.cantidad,
          precio:   parseFloat(detalle.precio_unitario_historico),
        });
      }

      const tiendasArray  = Object.values(itemsPorTienda);
      const totalPaquetes = tiendasArray.length;
      console.log(`🏪 Tiendas encontradas: ${totalPaquetes}`);

      // ── 16. Crear subpedidos + notificaciones + correos ───────────────────
      for (let i = 0; i < tiendasArray.length; i++) {
        const { tienda, tiendaId, items } = tiendasArray[i];
        const letra         = letraSubpedido(i);
        const codigoSub     = `${codigoPedido}-${letra}`;
        const paqueteNumero = i + 1;

        console.log(`📦 Creando subpedido ${codigoSub}`);

        const { error: errSub } = await supabase.from('subpedidos').insert([{
          pedido_id:        pedidoInsertado.id,
          tienda_id:        tiendaId,
          codigo_subpedido: codigoSub,
          letra,
          paquete_numero:   paqueteNumero,
          total_paquetes:   totalPaquetes,
          estado:           'pendiente_entrega_almacen',
        }]);

        if (errSub) {
          console.error(`❌ Error subpedido ${codigoSub}:`, errSub.message);
          continue;
        }
        console.log(`✅ Subpedido creado: ${codigoSub}`);

        const itemsResumen = items.map(it => `${it.cantidad}x ${it.nombre}`).join(', ');
        await supabase.from('notificaciones').insert([{
          tienda_id: tiendaId,
          tipo:      'venta',
          titulo:    '🎉 ¡Vendiste!',
          mensaje:   `Nueva venta por S/ ${monto_total_pagar}. Productos: ${itemsResumen}`,
          datos: {
            pedido_id:        pedidoInsertado.id,
            codigo_pedido:    codigoPedido,
            codigo_subpedido: codigoSub,
            total:            monto_total_pagar,
            items:            itemsResumen,
            direccion:        datos_entrega.direccion,
            whatsapp:         datos_entrega.whatsapp,
            nombre:           datos_entrega.nombre,
          },
        }]);

        if (tienda?.email) {
          try {
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
            console.log(`📧 Correo enviado a ${tienda.email}`);
          } catch (emailErr) {
            console.error(`⚠️ Error correo vendedor:`, emailErr.message);
          }
        }
      }

      // ── 17. Registrar pago ────────────────────────────────────────────────
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

      // ── 18. Ticket al cliente ─────────────────────────────────────────────
      try {
        const { data: usuarioData } = await supabase
          .from('usuarios').select('correo_electronico')
          .eq('id', usuario_id).single();

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
          items: (detallesPedido ?? []).map(det => {
            const prod = mapaProductos[det.producto_id];
            return {
              nombre:   prod?.nombre_producto ?? 'Producto',
              cantidad: det.cantidad,
              precio:   parseFloat(det.precio_unitario_historico),
            };
          }),
          pago: pago ?? null,
        });
        console.log('📧 Ticket enviado');
      } catch (ticketErr) {
        console.error('⚠️ Error ticket:', ticketErr.message);
      }

      console.log('🎉 Pedido completado:', codigoPedido);
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
      // Pedido + sus items reales (detalle_pedidos) con datos del producto
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          detalle_pedidos(
            cantidad, precio_unitario_historico, subtotal_item,
            productos(id, nombre_producto, imagenes)
          ),
          subpedidos(
            codigo_subpedido, estado, tracking_number,
            sharf_status, sharf_status_desc
          )
        `)
        .eq('usuario_id', userId)
        .order('fecha_pedido', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data ?? []);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
};

module.exports = orderController;