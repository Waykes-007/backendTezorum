const express        = require('express')
const router         = express.Router()
const planController = require('../controllers/planController')
const { verificarAdmin } = require('../middleware/authMiddleware')

// Rutas protegidas — solo admin/super_admin
router.get('/precios',              planController.obtenerPrecios)
router.get('/estado/:tiendaId',     verificarAdmin, planController.obtenerEstado)
router.post('/activar-oro',         verificarAdmin, planController.activarOro)
router.post('/degradar',            verificarAdmin, planController.degradar)

module.exports = router