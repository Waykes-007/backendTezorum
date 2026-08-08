const axios  = require('axios');
const crypto = require('crypto');
const orderController = require('./orderController');
const supabase = require('../config/supabase');
const { calcularTotales, r2 } = require('../utils/cupones');

const IZIPAY_USERNAME = process.env.IZIPAY_USERNAME;
const IZIPAY_PASSWORD = process.env.IZIPAY_PASSWORD_TEST;
const IZIPAY_BASE_URL = 'https://api.micuentaweb.pe';

const { tokensTemporales, datosTemporales } = require('../utils/storage');

// Select del carrito (incluye categoria_id para cupones por categoría)
const SELECT_CARRITO =
  'producto_id, cantidad, color, talla, productos(id, nombre_producto, precio_normal, precio_oferta, categoria_id, tienda_id, tiendas(id, nombre_tienda, email))';

// ── Recalcula el total legítimo en el servidor (blindaje anti-manipulación) ──
// Devuelve { subtotal, descuento, cuponId, totalReal } o null si el carrito
// está vacío (en ese caso se confía en el total del cliente, como antes).
async function blindarTotal({ itemsCarrito, cliente }) {
  if (!itemsCarrito || itemsCarrito.length === 0) return null;

  const costoEnvio = Number(cliente.costoEnvio ?? 0);
  const { subtotal, descuento, cuponId } = await calcularTotales({
    itemsCarrito,
    codigoCupon: cliente.codigoCupon ?? null,
    usuario_id:  cliente.userId,
  });
  const totalReal = r2(Math.max(0, subtotal - descuento + costoEnvio));
  return { subtotal, descuento, cuponId, totalReal, costoEnvio };
}

// ── Generar token de pago (Tarjeta) ──────────────────────────────────────────
const crearFormToken = async (req, res) => {
  try {
    const { total, orderId, cliente } = req.body;
    const credentials = Buffer.from(`${IZIPAY_USERNAME}:${IZIPAY_PASSWORD}`).toString('base64');

    console.log('🛒 Leyendo carrito para token:', cliente.userId);
    const { data: itemsCarrito, error: errCart } = await supabase
      .from('carrito').select(SELECT_CARRITO).eq('usuario_id', cliente.userId);

    if (errCart) console.error('❌ Error al leer carrito en crearFormToken:', errCart.message);
    console.log(`✅ Carrito leído: ${itemsCarrito?.length ?? 0} items`);

    // ── Blindaje: el total lo decide el servidor, no el cliente ──
    const blindado = await blindarTotal({ itemsCarrito, cliente });
    const totalACobrar = blindado ? blindado.totalReal : Number(total);

    if (blindado && Math.abs(totalACobrar - Number(total)) > 1) {
      console.warn(`⚠️ Total no coincide. Cliente=${total} Servidor=${totalACobrar}`);
      return res.status(409).json({
        error: 'El total cambió (precios o cupón). Refresca el carrito e intenta de nuevo.',
        total_correcto: totalACobrar,
      });
    }

    const response = await axios.post(
      `${IZIPAY_BASE_URL}/api-payment/V4/Charge/CreatePayment`,
      {
        amount:   Math.round(totalACobrar * 100),
        currency: 'PEN',
        orderId:  orderId,
        customer: {
          email:     cliente.correo ?? 'cliente@tezorum.com',
          reference: cliente.userId,
        },
      },
      { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status === 'SUCCESS') {
      const formToken = response.data.answer.formToken;
      const tokenId   = Date.now().toString(36);

      tokensTemporales.set(tokenId, formToken);
      datosTemporales.set(tokenId, {
        usuario_id:    cliente.userId,
        datosEntrega:  cliente.datosEntrega ?? {},
        monto:         totalACobrar,
        subtotal:      blindado ? blindado.subtotal   : (cliente.subtotal ?? totalACobrar),
        costo_envio:   blindado ? blindado.costoEnvio : (cliente.costoEnvio ?? 0),
        cupon_envio_id: cliente.cupon_envio_id ?? null,
        codigoCupon:   cliente.codigoCupon ?? null,
        tipo_envio:    cliente.tipoEnvio ?? 'Normal',
        orderId:       orderId,
        itemsCarrito:  itemsCarrito ?? [],
      });

      setTimeout(() => {
        tokensTemporales.delete(tokenId);
        datosTemporales.delete(tokenId);
      }, 15 * 60 * 1000);

      res.json({ formToken, tokenId });
    } else {
      res.status(400).json({ error: response.data.answer });
    }
  } catch (error) {
    console.error('Error Izipay:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
};

// ── Generar token de pago (Yape) ──────────────────────────────────────────────
const crearTokenYape = async (req, res) => {
  try {
    const { total, orderId, cliente } = req.body;
    const credentials = Buffer.from(`${IZIPAY_USERNAME}:${IZIPAY_PASSWORD}`).toString('base64');

    console.log('🛒 Leyendo carrito para token Yape:', cliente.userId);
    const { data: itemsCarrito, error: errCart } = await supabase
      .from('carrito').select(SELECT_CARRITO).eq('usuario_id', cliente.userId);

    if (errCart) console.error('❌ Error al leer carrito en crearTokenYape:', errCart.message);
    console.log(`✅ Carrito leído: ${itemsCarrito?.length ?? 0} items`);

    // ── Blindaje: el total lo decide el servidor, no el cliente ──
    const blindado = await blindarTotal({ itemsCarrito, cliente });
    const totalACobrar = blindado ? blindado.totalReal : Number(total);

    if (blindado && Math.abs(totalACobrar - Number(total)) > 1) {
      console.warn(`⚠️ Total Yape no coincide. Cliente=${total} Servidor=${totalACobrar}`);
      return res.status(409).json({
        error: 'El total cambió (precios o cupón). Refresca el carrito e intenta de nuevo.',
        total_correcto: totalACobrar,
      });
    }

    const response = await axios.post(
      `${IZIPAY_BASE_URL}/api-payment/V4/Charge/CreatePayment`,
      {
        amount:       Math.round(totalACobrar * 100),
        currency:     'PEN',
        orderId:      orderId,
        paymentForms: [{ paymentMethodType: 'YAPE_CODE' }],
        customer: {
          email:     cliente.correo ?? 'cliente@tezorum.com',
          reference: cliente.userId,
        },
      },
      { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' } }
    );

    if (response.data.status === 'SUCCESS') {
      const formToken = response.data.answer.formToken;
      const tokenId   = Date.now().toString(36) + '_yape';

      tokensTemporales.set(tokenId, formToken);
      datosTemporales.set(tokenId, {
        usuario_id:    cliente.userId,
        datosEntrega:  cliente.datosEntrega ?? {},
        monto:         totalACobrar,
        subtotal:      blindado ? blindado.subtotal   : (cliente.subtotal ?? totalACobrar),
        costo_envio:   blindado ? blindado.costoEnvio : (cliente.costoEnvio ?? 0),
        cupon_envio_id: cliente.cupon_envio_id ?? null,
        codigoCupon:   cliente.codigoCupon ?? null,
        tipo_envio:    cliente.tipoEnvio ?? 'Normal',
        orderId:       orderId,
        itemsCarrito:  itemsCarrito ?? [],
      });

      setTimeout(() => {
        tokensTemporales.delete(tokenId);
        datosTemporales.delete(tokenId);
      }, 15 * 60 * 1000);

      res.json({ tokenId });
    } else {
      res.status(400).json({ error: response.data.answer });
    }
  } catch (error) {
    console.error('Error Izipay Yape:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
};

// ── Webhook / IPN ─────────────────────────────────────────────────────────────
const webhook = async (req, res) => {
  console.log('🔔 Webhook Izipay recibido:', JSON.stringify(req.body));
  try {
    const krAnswer = req.body['kr-answer'];
    const krHash   = req.body['kr-hash'];
    const hmacKey  = process.env.IZIPAY_HMAC_TEST;
    const expected = crypto.createHmac('sha256', hmacKey).update(krAnswer).digest('hex');

    if (expected !== krHash) {
      console.error('⚠️ Firma HMAC inválida');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const answer = JSON.parse(krAnswer);
    const pago   = answer.transactions?.[0];

    console.log('💳 Estado del pago:', pago?.detailedStatus);
    console.log('📋 OrderId:', answer.orderDetails?.orderId);

    if (pago?.detailedStatus === 'AUTHORISED') {
      const orderId = answer.orderDetails?.orderId;
      let datosPedido = null;

      for (const [tokenId, datos] of datosTemporales.entries()) {
        if (datos.orderId === orderId) {
          datosPedido = datos;
          datosTemporales.delete(tokenId);
          break;
        }
      }

      if (!datosPedido) {
        console.warn('⚠️ No se encontraron datos del pedido para orderId:', orderId);
        return res.json({ status: 'OK' });
      }

      console.log('📦 Datos del pedido encontrados');

      const fakeReq = {
        body: {
          usuario_id:        datosPedido.usuario_id,
          monto_total_pagar: datosPedido.monto,
          monto_subtotal:    datosPedido.subtotal ?? datosPedido.monto,
          costo_envio:       datosPedido.costo_envio ?? 0,
          datos_entrega:     datosPedido.datosEntrega,
          tipo_envio:        datosPedido.tipo_envio ?? 'Normal',
          cupon_usado:       datosPedido.codigoCupon ?? null,
          cupon_envio_id:    datosPedido.cupon_envio_id ?? null,
          itemsCarrito:      datosPedido.itemsCarrito ?? [],
          pago: {
            estado:            'aprobado',
            mp_payment_id:     pago.uuid,
            mp_status:         'approved',
            mp_status_detail:  pago.detailedStatus,
            metodo_pago:       pago.paymentMethodType ?? 'TARJETA',
            tipo_pago:         pago.paymentMethodType ?? 'tarjeta',
            banco:             pago.cardDetails?.issuerName ?? null,
            ultimos_4_digitos: pago.cardDetails?.pan?.slice(-4) ?? null,
            nombre_titular:    pago.cardDetails?.cardHolderName ?? null,
          },
        },
      };

      const fakeRes = {
        status: (code) => ({
          json: (data) => {
            if (code >= 400) {
              console.error(`❌ Error al crear pedido [${code}]:`, JSON.stringify(data));
            } else {
              console.log(`✅ Pedido creado [${code}]:`, JSON.stringify(data));
            }
          },
        }),
        json: (data) => console.log('✅ Pedido creado exitosamente:', JSON.stringify(data)),
      };

      await orderController.crearPedido(fakeReq, fakeRes);

      // Vaciar el carrito del backend tras la compra exitosa
      try {
        await supabase.from('carrito').delete()
          .eq('usuario_id', datosPedido.usuario_id);
        console.log('🧹 Carrito del usuario vaciado tras la compra');
      } catch (e) {
        console.error('⚠️ No se pudo vaciar el carrito:', e.message);
      }
    }

    res.json({ status: 'OK' });
  } catch (e) {
    console.error('🚨 Webhook Izipay error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
};

module.exports = { crearFormToken, crearTokenYape, webhook, tokensTemporales };