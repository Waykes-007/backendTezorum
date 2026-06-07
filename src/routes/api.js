const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const supabase             = require('../config/supabase');
const authController       = require('../controllers/authController');
const walletController     = require('../controllers/walletController');
const shopController       = require('../controllers/shopController');
const orderController      = require('../controllers/orderController');
const cartController       = require('../controllers/cartController');
const couponController     = require('../controllers/couponController');
const resenaController     = require('../controllers/resenaController');
const favoritosController  = require('../controllers/favoritosController');
const pagoRoutes           = require('./pagoRoutes');
const izipayRoutes         = require('./izipayRoutes');
const { tokensTemporales, datosTemporales } = require('../utils/storage');

router.post('/auth/register',           authController.register);
router.post('/auth/login',              authController.login);
router.post('/auth/completar-registro', authController.completarRegistro);
router.post('/pedidos/crear',           orderController.crearPedido);
router.post('/wallet/agregar',          walletController.reclamarPremioDiario);

router.use('/pagos', pagoRoutes);

// ── Izipay handlers específicos PRIMERO ──────────────────────────────────────
router.get('/izipay/pagar/:tokenId', (req, res) => {
  const { tokenId } = req.params;
  const formToken   = tokensTemporales.get(tokenId);

  if (!formToken) {
    return res.send(`
      <html><body style="text-align:center;font-family:Arial;padding:40px;">
        <h1 style="color:red;">⏱️ Token expirado</h1>
        <p>Vuelve a la app e intenta de nuevo.</p>
      </body></html>`);
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
    body { margin:0; padding:0; font-family:Arial,sans-serif; background:linear-gradient(135deg,#6B21A8,#9333EA); min-height:100vh; }
    .header { text-align:center; padding:30px 20px 20px; }
    .header h2 { color:white; font-size:22px; margin:0; font-weight:900; }
    .header p  { color:rgba(255,255,255,0.8); font-size:13px; margin:4px 0 0; }
    .container { background:white; border-radius:24px 24px 0 0; padding:24px; min-height:calc(100vh - 120px); }
    .secure-badge { display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:20px; color:#666; font-size:13px; }
    .kr-payment-button { background:linear-gradient(135deg,#6B21A8,#9333EA) !important; border-radius:14px !important; width:100% !important; height:52px !important; font-size:16px !important; font-weight:bold !important; margin-top:16px !important; border:none !important; box-shadow:0 4px 15px rgba(107,33,168,0.4) !important; }
    .kr-field-wrapper { border-radius:12px !important; border:1.5px solid #e5e7eb !important; margin-bottom:12px !important; }
    .kr-field-wrapper:focus-within { border-color:#6B21A8 !important; }
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
</html>`);
});

// ── Éxito del pago ────────────────────────────────────────────────────────────
router.post('/izipay/exito', async (req, res) => {
  console.log('💳 /izipay/exito recibido');
  console.log('Body keys:', Object.keys(req.body ?? {}));

  // Responder con HTML simple — sin JS de redirección
  // Flutter detecta esta página via onPageFinished
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
    </html>`);

  // Procesar pedido de forma asíncrona
  try {
    const krAnswer = req.body['kr-answer'];
    const krHash   = req.body['kr-hash'];
    const hmacKey  = process.env.IZIPAY_HMAC_TEST;

    if (!krAnswer || !krHash || !hmacKey) {
      console.error('❌ Faltan parámetros HMAC');
      return;
    }

    const expected = crypto.createHmac('sha256', hmacKey).update(krAnswer).digest('hex');
    if (expected !== krHash) {
      console.error('⚠️ Firma HMAC inválida');
      return;
    }

    const answer  = JSON.parse(krAnswer);
    const orderId = answer.orderDetails?.orderId;
    console.log('📋 OrderId:', orderId, '| Estado:', answer.orderStatus);

    if (answer.orderStatus !== 'PAID') {
      console.warn('⚠️ Estado no es PAID:', answer.orderStatus);
      return;
    }

    let datosPedido = null;
    for (const [tokenId, datos] of datosTemporales.entries()) {
      if (datos.orderId === orderId) {
        datosPedido = datos;
        datosTemporales.delete(tokenId);
        console.log('✅ Datos encontrados para orderId:', orderId);
        break;
      }
    }

    if (!datosPedido) {
      console.error('❌ No se encontraron datos para orderId:', orderId);
      console.log('📦 Tokens disponibles:', [...datosTemporales.keys()]);
      return;
    }

    // Si el token no tiene items, leer carrito fresco
    let itemsCarrito = datosPedido.itemsCarrito ?? [];
    console.log('📦 Items en token:', itemsCarrito.length);

    if (itemsCarrito.length === 0) {
      console.log('🛒 Token sin items, leyendo carrito fresco...');
      const { data: carritoFresco } = await supabase
        .from('carrito')
        .select('producto_id, cantidad, productos(id, nombre_producto, precio_normal, precio_oferta, tienda_id, tiendas(id, nombre_tienda, email))')
        .eq('usuario_id', datosPedido.usuario_id);
      itemsCarrito = carritoFresco ?? [];
      console.log('🛒 Carrito fresco:', itemsCarrito.length, 'items');
    }

    const pago = answer.transactions?.[0];

    const fakeReq = {
      body: {
        usuario_id:        datosPedido.usuario_id,
        monto_total_pagar: datosPedido.monto,
        monto_subtotal:    datosPedido.subtotal ?? datosPedido.monto,
        costo_envio:       datosPedido.costo_envio ?? 0,
        datos_entrega:     datosPedido.datosEntrega,
        tipo_envio:        datosPedido.tipo_envio ?? 'Normal',
        cupon_usado:       datosPedido.codigoCupon ?? null,
        itemsCarrito,
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
      status: (code) => ({
        json: (data) => {
          if (code >= 400) console.error(`❌ Error pedido [${code}]:`, JSON.stringify(data));
          else console.log(`✅ Pedido creado [${code}]:`, JSON.stringify(data));
        },
      }),
      json: (data) => console.log('✅ Pedido creado:', JSON.stringify(data)),
    };

    await orderController.crearPedido(fakeReq, fakeRes);

  } catch (e) {
    console.error('🚨 Error en /izipay/exito:', e.message, e.stack);
  }
});

// ── Error del pago ────────────────────────────────────────────────────────────
router.post('/izipay/error', (req, res) => {
  console.log('❌ /izipay/error recibido');
  res.send(`
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="text-align:center;font-family:Arial;padding:40px;background:#f5f5f5;">
      <div style="background:white;border-radius:16px;padding:40px;max-width:400px;margin:0 auto;">
        <h1 style="color:red;">❌ Pago rechazado</h1>
        <p style="color:#666;">No se pudo procesar tu pago.</p>
        <p style="color:#666;">Puedes cerrar esta ventana e intentar de nuevo.</p>
      </div>
    </body>
    </html>`);
});

// ── Router general de Izipay DESPUÉS de los handlers específicos ──────────────
router.use('/izipay', izipayRoutes);

// ── ENDPOINT DE PRUEBA ────────────────────────────────────────────────────────
router.post('/test-pedido', async (req, res) => {
  console.log('🧪 test-pedido llamado');
  const fakeReq = {
    body: {
      usuario_id:        '8488d77f-6f8d-4cd0-9170-b2fcd273210e',
      monto_total_pagar: 800,
      monto_subtotal:    800,
      costo_envio:       0,
      datos_entrega: {
        nombre:          'Ivan Paredes',
        dni:             '73555411',
        whatsapp:        '902142390',
        direccion:       'jr. jose galvez 366',
        referencia:      'test',
        departamento_id: '15',
        provincia_id:    '128',
        distrito_id:     '1298',
      },
      tipo_envio:  'Normal',
      cupon_usado: null,
      itemsCarrito: [
        {
          producto_id: '2fe1d260-e059-4b72-a969-137f261b58e5',
          cantidad: 1,
          productos: {
            id: '2fe1d260-e059-4b72-a969-137f261b58e5',
            nombre_producto: 'TECLADO MECANICO AULA F75',
            precio_normal: 250,
            precio_oferta: 250,
            tienda_id: 'ff5337f1-3566-4971-9cba-341102b59af6',
            tiendas: {
              id: 'ff5337f1-3566-4971-9cba-341102b59af6',
              nombre_tienda: 'Importaciones JC',
              email: 'jossheavenly@gmail.com',
            }
          }
        },
        {
          producto_id: '1ac5bac2-9236-47e3-8253-ff46a8d655a2',
          cantidad: 1,
          productos: {
            id: '1ac5bac2-9236-47e3-8253-ff46a8d655a2',
            nombre_producto: 'Jordan 4 Retro Navy SB',
            precio_normal: 550,
            precio_oferta: 550,
            tienda_id: '38d577ad-492d-4a40-99dd-8262008c9a50',
            tiendas: {
              id: '38d577ad-492d-4a40-99dd-8262008c9a50',
              nombre_tienda: 'Tezórum Official',
              email: 'josueacunak74e3@gmail.com',
            }
          }
        }
      ],
      pago: {
        estado:      'aprobado',
        mp_status:   'approved',
        metodo_pago: 'card',
      },
    },
  };

  const fakeRes = {
    status: (code) => ({ json: (data) => res.status(code).json(data) }),
    json:   (data) => res.json(data),
  };

  await orderController.crearPedido(fakeReq, fakeRes);
});

router.post('/test-paso15/:pedidoId', async (req, res) => {
  const { pedidoId } = req.params;
  
  const { data: detallesPedido } = await supabase
    .from('detalle_pedidos')
    .select('producto_id, cantidad, precio_unitario_historico')
    .eq('pedido_id', pedidoId);

  const productosIds = (detallesPedido ?? []).map(d => d.producto_id);
  
  const { data: productosData, error: errProd } = await supabase
    .from('productos')
    .select('id, nombre_producto, tienda_id')
    .in('id', productosIds);

  const tiendaIds = [...new Set((productosData ?? []).map(p => p.tienda_id).filter(Boolean))];
  
  const { data: tiendasData, error: errTienda } = await supabase
    .from('tiendas')
    .select('id, nombre_tienda, email')
    .in('id', tiendaIds);

  res.json({
    detallesPedido,
    productosIds,
    productosData,
    errProd: errProd?.message,
    tiendaIds,
    tiendasData,
    errTienda: errTienda?.message,
  });
});

// ── Resto de rutas ────────────────────────────────────────────────────────────
router.post('/auth/validar-celular',            authController.validarCelular);
router.post('/carrito/agregar',                 cartController.agregarAlCarrito);
router.post('/cupones/validar',                 couponController.validarCupon);
router.post('/resenas',                         resenaController.crearResena);
router.get ('/resenas/:productoId',             resenaController.obtenerResenas);
router.get ('/promociones',                     shopController.getPromociones);
router.get ('/productos/:id',                   shopController.getProductoPorId);
router.get ('/cupones/disponibles',             couponController.listarCuponesDisponibles);
router.get ('/auth/perfil/:id',                 authController.obtenerPerfil);
router.get ('/favoritos/:userId',               favoritosController.obtener);
router.get ('/tiendas/:id',                     shopController.getTienda);
router.post('/favoritos',                       favoritosController.agregar);
router.delete('/favoritos/:userId/:productoId', favoritosController.eliminar);
router.delete('/carrito/:userId/:productoId',   cartController.eliminarDelCarrito);
router.delete('/resenas/:productoId/:userId',   resenaController.eliminarResena);
router.get ('/carrito/:userId',                 cartController.obtenerCarrito);
router.get ('/pedidos/usuario/:userId',         orderController.obtenerPedidosPorUsuario);
router.get ('/wallet/estado/:userId',           walletController.obtenerEstadoBilletera);
router.get ('/productos',                       shopController.obtenerProductos);

// ── Check DB ──────────────────────────────────────────────────────────────────
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