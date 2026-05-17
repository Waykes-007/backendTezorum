const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../config/supabase'); 
const authController = require('../controllers/authController');
const walletController = require('../controllers/walletController');
const shopController = require('../controllers/shopController');
const orderController = require('../controllers/orderController');
const cartController = require('../controllers/cartController');
const couponController = require('../controllers/couponController');
const resenaController = require('../controllers/resenaController');
const favoritosController = require('../controllers/favoritosController');
const pagoRoutes = require('./pagoRoutes');
const izipayRoutes = require('./izipayRoutes');
const { tokensTemporales, datosTemporales } = require('../controllers/izipayController');

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/completar-registro', authController.completarRegistro);
router.post('/pedidos/crear', orderController.crearPedido);
router.post('/wallet/agregar', walletController.reclamarPremioDiario);

router.use('/pagos', pagoRoutes);
router.use('/izipay', izipayRoutes);

router.post('/auth/validar-celular', authController.validarCelular);
router.post('/carrito/agregar', cartController.agregarAlCarrito);
router.post('/cupones/validar', couponController.validarCupon);
router.post('/resenas', resenaController.crearResena);
router.get('/resenas/:productoId', resenaController.obtenerResenas);
router.get('/promociones', shopController.getPromociones);
router.get('/productos/:id', shopController.getProductoPorId);
router.get('/cupones/disponibles', couponController.listarCuponesDisponibles);
router.get('/auth/perfil/:id', authController.obtenerPerfil);
router.get('/favoritos/:userId', favoritosController.obtener);
router.get('/tiendas/:id', shopController.getTienda);
router.post('/favoritos', favoritosController.agregar);
router.delete('/favoritos/:userId/:productoId', favoritosController.eliminar);
router.delete('/carrito/:userId/:productoId', cartController.eliminarDelCarrito);
router.delete('/resenas/:productoId/:userId', resenaController.eliminarResena);
router.get('/carrito/:userId', cartController.obtenerCarrito);
router.get('/pedidos/usuario/:userId', orderController.obtenerPedidosPorUsuario);
router.get('/wallet/estado/:userId', walletController.obtenerEstadoBilletera);
router.get('/productos', shopController.obtenerProductos);

// ── Izipay — página de pago hosted ──────────────────────────────────────────
router.get('/izipay/pagar/:tokenId', (req, res) => {
  const { tokenId } = req.params;
  const formToken = tokensTemporales.get(tokenId);

  if (!formToken) {
    return res.send(`
      <html>
      <body style="text-align:center;font-family:Arial;padding:40px;">
        <h1 style="color:red;">⏱️ Token expirado</h1>
        <p>Vuelve a la app e intenta de nuevo.</p>
      </body>
      </html>
    `);
  }

  const publicKey = process.env.IZIPAY_PUBLIC_KEY_TEST;

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <script type="text/javascript"
    src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js"
    kr-public-key="${publicKey}"
    kr-language="es-PE"
    kr-post-url-success="https://backendtezorum.onrender.com/api/izipay/exito"
    kr-post-url-refused="https://backendtezorum.onrender.com/api/izipay/error">
  </script>
  <link rel="stylesheet" href="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/neon-reset.min.css">
  <script type="text/javascript" src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/neon.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: linear-gradient(135deg, #6B21A8, #9333EA); min-height: 100vh; }
    .header { text-align: center; padding: 30px 20px 20px; }
    .header h2 { color: white; font-size: 22px; margin: 0; font-weight: 900; }
    .header p { color: rgba(255,255,255,0.8); font-size: 13px; margin: 4px 0 0; }
    .container { background: white; border-radius: 24px 24px 0 0; padding: 24px; min-height: calc(100vh - 120px); }
    .secure-badge { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 20px; color: #666; font-size: 13px; }
    .kr-payment-button { background: linear-gradient(135deg, #6B21A8, #9333EA) !important; border-radius: 14px !important; width: 100% !important; height: 52px !important; font-size: 16px !important; font-weight: bold !important; margin-top: 16px !important; border: none !important; box-shadow: 0 4px 15px rgba(107,33,168,0.4) !important; }
    .kr-field-wrapper { border-radius: 12px !important; border: 1.5px solid #e5e7eb !important; margin-bottom: 12px !important; }
    .kr-field-wrapper:focus-within { border-color: #6B21A8 !important; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🔒 Pago seguro</h2>
    <p>Tezórum • Powered by Izipay</p>
  </div>
  <div class="container">
    <div class="secure-badge">🛡️ Tu información está protegida con encriptación SSL</div>
    <div class="kr-embedded" kr-form-token="${formToken}">
      <div class="kr-pan"></div>
      <div class="kr-expiry"></div>
      <div class="kr-security-code"></div>
      <button class="kr-payment-button"></button>
    </div>
  </div>
</body>
</html>
  `);
});

// ── Izipay — éxito del pago ──────────────────────────────────────────────────
router.post('/izipay/exito', async (req, res) => {
  try {
    console.log('✅ Pago exitoso recibido:', JSON.stringify(req.body));

    const krAnswer = req.body['kr-answer'];
    const krHash   = req.body['kr-hash'];

    // Verificar firma HMAC
    const hmacKey       = process.env.IZIPAY_HMAC_TEST;
    const krAnswerFixed = krAnswer.replace(/\//g, '\\/');
    const expected      = crypto.createHmac('sha256', hmacKey).update(krAnswerFixed).digest('hex');

    if (expected !== krHash) {
      console.error('⚠️ Firma inválida en éxito');
      return res.status(401).send('Firma inválida');
    }

    const answer  = JSON.parse(krAnswer);
    const orderId = answer.orderDetails?.orderId;

    if (answer.orderStatus === 'PAID') {
      let datosPedido = null;

      for (const [tokenId, datos] of datosTemporales.entries()) {
        if (datos.orderId === orderId) {
          datosPedido = datos;
          datosTemporales.delete(tokenId);
          break;
        }
      }

      if (datosPedido) {
        const pago = answer.transactions?.[0];
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
              estado:            'aprobado',
              mp_payment_id:     pago?.uuid ?? orderId,
              mp_status:         'approved',
              mp_status_detail:  pago?.detailedStatus ?? 'AUTHORISED',
              metodo_pago:       pago?.paymentMethodType ?? 'card',
              tipo_pago:         pago?.paymentMethodType ?? 'credit_card',
              banco:             pago?.transactionDetails?.cardDetails?.issuerName ?? null,
              ultimos_4_digitos: pago?.transactionDetails?.cardDetails?.pan?.replace(/X/g, '')?.slice(-4) ?? null,
              nombre_titular:    pago?.transactionDetails?.cardDetails?.cardHolderName ?? null,
            },
          },
        };

        const fakeRes = {
          status: (code) => ({ json: (data) => console.log(`Pedido creado [${code}]:`, data) }),
          json:   (data) => console.log('Pedido creado:', data),
        };

        await orderController.crearPedido(fakeReq, fakeRes);
        console.log('✅ Pedido creado desde éxito Izipay');
      } else {
        console.warn('⚠️ No se encontraron datos del pedido para orderId:', orderId);
      }
    }

    res.send(`
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="text-align:center;font-family:Arial;padding:40px;background:#f5f5f5;">
        <div style="background:white;border-radius:16px;padding:40px;max-width:400px;margin:0 auto;">
          <h1 style="color:#16a34a;">✅ ¡Pago exitoso!</h1>
          <p style="color:#666;">Tu pedido ha sido registrado correctamente.</p>
          <p style="color:#666;">Recibirás un correo con los detalles.</p>
        </div>
      </body>
      </html>
    `);
  } catch (e) {
    console.error('Error en éxito Izipay:', e);
    res.status(500).send('Error');
  }
});

// ── Izipay — error del pago ───────────────────────────────────────────────────
router.post('/izipay/error', (req, res) => {
  res.send(`
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="text-align:center;font-family:Arial;padding:40px;background:#f5f5f5;">
      <div style="background:white;border-radius:16px;padding:40px;max-width:400px;margin:0 auto;">
        <h1 style="color:red;">❌ Pago rechazado</h1>
        <p style="color:#666;">No se pudo procesar tu pago. Puedes cerrar esta ventana e intentar de nuevo.</p>
      </div>
    </body>
    </html>
  `);
});

// ── Check DB ─────────────────────────────────────────────────────────────────
router.get('/check-db', async (req, res) => {
  try {
    const { data, error, status } = await supabase
      .from('categorias').select('*').limit(1);
    if (error) {
      const httpStatus = (status > 99 && status < 600) ? status : 500;
      return res.status(httpStatus).json({ status: 'Error en Supabase', message: error.message });
    }
    res.json({ status: 'Conectado a Supabase ✅', data });
  } catch (err) {
    res.status(500).json({ status: 'Error de conexión ❌', error: err.message });
  }
});

module.exports = router;