const axios  = require('axios');
const crypto = require('crypto');

const IZIPAY_USERNAME = process.env.IZIPAY_USERNAME;
const IZIPAY_PASSWORD = process.env.IZIPAY_PASSWORD_TEST;
const IZIPAY_BASE_URL = 'https://api.micuentaweb.pe';

// Mapa temporal para guardar tokens
const tokensTemporales = new Map();

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

      // Guardar con ID corto
      const tokenId = Date.now().toString(36);
      tokensTemporales.set(tokenId, formToken);

      // Limpiar después de 10 minutos
      setTimeout(() => tokensTemporales.delete(tokenId), 10 * 60 * 1000);

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
    }

    res.json({ status: 'OK' });
  } catch (e) {
    console.error('Webhook Izipay error:', e);
    res.status(500).json({ error: e.message });
  }
};

module.exports = { crearFormToken, webhook, tokensTemporales };