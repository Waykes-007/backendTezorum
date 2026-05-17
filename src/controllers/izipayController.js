const axios  = require('axios');
const crypto = require('crypto');
const orderController = require('./orderController');

const IZIPAY_USERNAME = process.env.IZIPAY_USERNAME;
const IZIPAY_PASSWORD = process.env.IZIPAY_PASSWORD_TEST;
const IZIPAY_BASE_URL = 'https://api.micuentaweb.pe';

const tokensTemporales = new Map();
const datosTemporales  = new Map();

// ── Generar token de pago ────────────────────────────────────────────────────
const crearFormToken = async (req, res) => {
  try {
    const { total, orderId, cliente } = req.body;

    const credentials = Buffer.from(`${IZIPAY_USERNAME}:${IZIPAY_PASSWORD}`).toString('base64');

    const response = await axios.post(
      `${IZIPAY_BASE_URL}/api-payment/V4/Charge/CreatePayment`,
      {
        amount:   Math.round(total * 100),
        currency: 'PEN',
        orderId:  orderId,
        customer: {
          email:     cliente.correo ?? 'cliente@tezorum.com',
          reference: cliente.userId,
        },
      },
      {
        headers: {
          Authorization:  `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Izipay response status:', response.data.status);

    if (response.data.status === 'SUCCESS') {
      const formToken = response.data.answer.formToken;
      const tokenId   = Date.now().toString(36);

      // Guardar formToken
      tokensTemporales.set(tokenId, formToken);

      // Guardar datos del pedido para cuando llegue el webhook
      datosTemporales.set(tokenId, {
        usuario_id:   cliente.userId,
        datosEntrega: cliente.datosEntrega ?? {},
        monto:        total,
        codigoCupon:  cliente.codigoCupon ?? null,
        orderId:      orderId,
      });

      // Limpiar después de 15 minutos
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

// ── Webhook / IPN ────────────────────────────────────────────────────────────
const webhook = async (req, res) => {
  try {
    const krAnswer = req.body['kr-answer'];
    const krHash   = req.body['kr-hash'];

    // ── Verificar firma HMAC ──
    const hmacKey  = process.env.IZIPAY_HMAC_TEST;
    const expected = crypto
      .createHmac('sha256', hmacKey)
      .update(krAnswer)
      .digest('hex');

    if (expected !== krHash) {
      console.error('⚠️ Firma HMAC inválida');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const answer = JSON.parse(krAnswer);
    const pago   = answer.transactions?.[0];

    if (pago?.detailedStatus === 'AUTHORISED') {
      console.log('✅ Pago aprobado:', pago.uuid);

      // Buscar datos del pedido por orderId
      const orderId = answer.orderDetails?.orderId;
      let datosPedido = null;

      for (const [tokenId, datos] of datosTemporales.entries()) {
        if (datos.orderId === orderId) {
          datosPedido = datos;
          datosTemporales.delete(tokenId);
          break;
        }
      }

      if (datosPedido) {
        const fakeReq = {
          body: {
            usuario_id:        datosPedido.usuario_id,
            monto_total_pagar: datosPedido.monto,
            monto_subtotal:    datosPedido.monto,
            costo_envio:       0,
            datos_entrega:     datosPedido.datosEntrega,
            tipo_envio:        'Normal',
            cupon_usado:       datosPedido.codigoCupon,
            pago: {
              estado:           'aprobado',
              mp_payment_id:    pago.uuid,
              mp_status:        'approved',
              mp_status_detail: pago.detailedStatus,
              metodo_pago:      pago.paymentMethodType ?? 'card',
              tipo_pago:        pago.paymentMethodType ?? 'credit_card',
              banco:            pago.cardDetails?.issuerName ?? null,
              ultimos_4_digitos: pago.cardDetails?.pan?.slice(-4) ?? null,
              nombre_titular:   pago.cardDetails?.cardHolderName ?? null,
            },
          },
        };

        const fakeRes = {
          status: (code) => ({
            json: (data) => console.log(`Pedido creado desde Izipay:`, data)
          }),
        };

        await orderController.crearPedido(fakeReq, fakeRes);
        console.log('✅ Pedido creado desde webhook Izipay');
      } else {
        console.warn('⚠️ No se encontraron datos del pedido para orderId:', orderId);
      }
    }

    res.json({ status: 'OK' });
  } catch (e) {
    console.error('Webhook Izipay error:', e);
    res.status(500).json({ error: e.message });
  }
};

module.exports = { crearFormToken, webhook, tokensTemporales };