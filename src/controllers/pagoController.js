const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const crearPreferencia = async (req, res) => {
  try {
    const { items, datosEntrega, userId, total, codigoCupon } = req.body;

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: items.map(item => ({
          id:          item.productoId,
          title:       item.nombre,
          quantity:    Number(item.cantidad),
          unit_price:  parseFloat(item.precio),
          currency_id: 'PEN',
        })),
        payer: {
          name:  datosEntrega.nombre,
          phone: { number: datosEntrega.whatsapp },
        },
        back_urls: {
          success: `${process.env.BASE_URL}/pago/exitoso`,
          failure: `${process.env.BASE_URL}/pago/error`,
          pending: `${process.env.BASE_URL}/pago/pendiente`,
        },
        auto_return:        'approved',
        notification_url:   `${process.env.BASE_URL}/api/pagos/webhook`,
        external_reference: userId,
        metadata: {
          userId,
          codigoCupon:   codigoCupon ?? '',
          datosEntrega:  JSON.stringify(datosEntrega),
        },
      },
    });

    res.json({
      preferenceId: result.id,
      initPoint:    result.init_point,
      sandbox:      result.sandbox_init_point,
    });

  } catch (error) {
    console.error('Error MP:', error);
    res.status(500).json({ error: error.message });
  }
};

const webhook = async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment') {
    try {
      const payment = new Payment(client);
      const pago    = await payment.get({ id: data.id });

      if (pago.status === 'approved') {
        // Aquí puedes llamar tu lógica de orderController
        console.log('Pago aprobado:', pago.id, 'Usuario:', pago.metadata?.user_id);
      }
    } catch (e) {
      console.error('Webhook error:', e);
    }
  }

  res.sendStatus(200);
};

module.exports = { crearPreferencia, webhook };