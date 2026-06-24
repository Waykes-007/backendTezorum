const express        = require('express')
const router         = express.Router()
const planController = require('../controllers/planController')
const { soloAdmin } = require('../middlewares/authMiddleware')

// Rutas protegidas — solo admin/super_admin
router.get('/precios',              planController.obtenerPrecios)
router.get('/estado/:tiendaId',     soloAdmin, planController.obtenerEstado)
router.post('/activar-oro',         soloAdmin, planController.activarOro)
router.post('/degradar',            soloAdmin, planController.degradar)

module.exports = router