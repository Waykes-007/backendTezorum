const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const orderController = require('./orderController');

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
          success: 'tezorum://pago/exitoso',
          failure: 'tezorum://pago/error',
          pending: 'tezorum://pago/pendiente',
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
      const payment   = new Payment(client);
      const pago      = await payment.get({ id: data.id });

      if (pago.status === 'approved') {
        const userId       = pago.external_reference;
        const datosEntrega = JSON.parse(pago.metadata?.datos_entrega || '{}');
        const codigoCupon  = pago.metadata?.codigo_cupon || null;

        // Llamar a crearPedido internamente con datos del pago
        const fakeReq = {
          body: {
            usuario_id:        userId,
            monto_total_pagar: pago.transaction_amount,
            monto_subtotal:    pago.transaction_amount - (pago.shipping_amount || 0),
            costo_envio:       pago.shipping_amount || 0,
            datos_entrega:     datosEntrega,
            tipo_envio:        'Normal',
            cupon_usado:       codigoCupon,
            pago: {
              estado:            'aprobado',
              mp_payment_id:     pago.id.toString(),
              mp_preference_id:  pago.preference_id,
              mp_status:         pago.status,
              mp_status_detail:  pago.status_detail,
              metodo_pago:       pago.payment_method_id,
              tipo_pago:         pago.payment_type_id,
              banco:             pago.issuer_name ?? null,
              ultimos_4_digitos: pago.card?.last_four_digits ?? null,
              nombre_titular:    pago.card?.cardholder?.name ?? null,
            },
          },
        };

        const fakeRes = {
          status: (code) => ({ json: (data) => console.log(`✅ Pedido creado desde webhook:`, data) }),
        };

        await orderController.crearPedido(fakeReq, fakeRes);
        console.log(`✅ Pago aprobado y pedido creado — MP ID: ${pago.id}`);
      }
    } catch (e) {
      console.error('Webhook error:', e);
    }
  }

  res.sendStatus(200);
};

module.exports = { crearPreferencia, webhook };