const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase'); 
const authController = require('../controllers/authController');
const walletController = require('../controllers/walletController');
const shopController = require('../controllers/shopController'); // <--- AGREGA ESTA LÍNEA
const orderController = require('../controllers/orderController');
const walletService = require('../services/walletService');
const cartController = require('../controllers/cartController');
const couponController = require('../controllers/couponController');
const resenaController = require('../controllers/resenaController');
const favoritosController = require('../controllers/favoritosController');
const pagoRoutes = require('./pagoRoutes');
const izipayRoutes = require('./izipayRoutes');




router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/completar-registro', authController.completarRegistro);
router.post('/pedidos/crear', orderController.crearPedido);
router.post('/wallet/agregar', walletController.reclamarPremioDiario);

router.use('/pagos', pagoRoutes);
router.use('/izipay', izipayRoutes);

// Ajustamos esta línea para que coincida con tu ApiService.dart
router.post('/auth/validar-celular', authController.validarCelular); 

router.post('/carrito/agregar', cartController.agregarAlCarrito);
router.post('/cupones/validar', couponController.validarCupon);
router.post('/resenas', resenaController.crearResena);
router.get('/resenas/:productoId', resenaController.obtenerResenas);
router.get('/promociones', shopController.getPromociones);
router.get('/productos/:id', shopController.getProductoPorId);
router.get('/cupones/disponibles', couponController.listarCuponesDisponibles);
router.get('/auth/perfil/:id', authController.obtenerPerfil);
router.get('/favoritos/:userId',              favoritosController.obtener);
router.get('/tiendas/:id', shopController.getTienda);
router.post('/favoritos',                     favoritosController.agregar);
router.delete('/favoritos/:userId/:productoId', favoritosController.eliminar);
// En tu archivo de rutas (ej: src/routes/cartRoutes.js)
router.delete('/carrito/:userId/:productoId', cartController.eliminarDelCarrito);
router.delete('/resenas/:productoId/:userId', resenaController.eliminarResena);


// --- RUTAS DE NEGOCIO ---
// En tu archivo de rutas (ej: api.js o walletRoutes.js)
router.get('/carrito/:userId', cartController.obtenerCarrito);
// Asegúrate de que el parámetro sea :userId
router.get('/pedidos/usuario/:userId', orderController.obtenerPedidosPorUsuario);
router.get('/wallet/estado/:userId', walletController.obtenerEstadoBilletera);
router.get('/productos', shopController.obtenerProductos);



// --- RUTA DE PRUEBA CORREGIDA ---
router.get('/check-db', async (req, res) => {
    console.log("🔍 Intentando conectar a:", process.env.SUPABASE_URL); 
    
    try {
        const { data, error, status } = await supabase
            .from('categorias')
            .select('*')
            .limit(1);

        if (error) {
            console.error("❌ Error de Supabase detallado:", error);
            const httpStatus = (status > 99 && status < 600) ? status : 500;
            return res.status(httpStatus).json({ 
                status: 'Error en Supabase', 
                message: error.message,
                details: error.details 
            });
        }

        res.json({ 
            status: 'Conectado a Supabase ✅', 
            mensaje: 'La tabla categorías está accesible',
            data: data 
        });

    } catch (err) {
        console.error("🚨 Error capturado en el catch:", err);
        
        let mensajePersonalizado = err.message;
        if (err.message.includes('ENOTFOUND')) {
            mensajePersonalizado = "No se pudo encontrar el servidor de Supabase. Revisa tu conexión a internet o tus DNS.";
        }

        res.status(500).json({ 
            status: 'Error de conexión ❌', 
            error: mensajePersonalizado,
            code: err.code || 'UNKNOWN_ERROR'
        });
    }
});

module.exports = router;