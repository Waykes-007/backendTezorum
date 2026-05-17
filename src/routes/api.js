const express = require('express');
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
const { tokensTemporales } = require('../controllers/izipayController');

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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.css">
  <script src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js"
    kr-public-key="${publicKey}"
    kr-post-url-success="https://backendtezorum.onrender.com/api/izipay/exito"
    kr-post-url-refused="https://backendtezorum.onrender.com/api/izipay/error">
  </script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: Arial, sans-serif; background: #f5f5f5; }
    .header { text-align: center; margin-bottom: 20px; }
    .header h2 { color: #6B21A8; font-size: 20px; margin: 0; }
    .header p { color: #666; font-size: 13px; margin: 4px 0 0; }
    .kr-embedded { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .kr-payment-button { background: #6B21A8 !important; border-radius: 12px !important; width: 100% !important; height: 48px !important; font-size: 16px !important; font-weight: bold !important; margin-top: 12px !important; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🔒 Pago seguro</h2>
    <p>Tezórum</p>
  </div>
  <div class="kr-embedded" kr-form-token="${formToken}">
    <div class="kr-pan"></div>
    <div class="kr-expiry"></div>
    <div class="kr-security-code"></div>
    <div class="kr-identity-document-number"></div>
    <button class="kr-payment-button"></button>
  </div>
</body>
</html>
  `);
});

router.get('/izipay/exito', (req, res) => {
  res.send(`
    <html>
    <body style="text-align:center;font-family:Arial;padding:40px;">
      <h1 style="color:green;">✅ Pago exitoso</h1>
      <p>Tu pedido ha sido registrado. Puedes cerrar esta ventana.</p>
    </body>
    </html>
  `);
});

router.get('/izipay/error', (req, res) => {
  res.send(`
    <html>
    <body style="text-align:center;font-family:Arial;padding:40px;">
      <h1 style="color:red;">❌ Pago rechazado</h1>
      <p>No se pudo procesar tu pago. Puedes cerrar esta ventana e intentar de nuevo.</p>
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