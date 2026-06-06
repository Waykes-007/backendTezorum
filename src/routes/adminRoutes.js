const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');
const { soloSuperAdmin, soloAdmin } = require('../middleware/authMiddleware');

// ── Verificar si es admin (llamado en login, sin middleware) ──────────────────
router.post('/verificar', adminController.verificarAdmin);

// ── Activar admin cuando acepta invitación (sin middleware) ───────────────────
router.post('/activar', adminController.activarAdmin);

// ── Rutas protegidas: solo Super Admin puede gestionar admins ─────────────────
router.get('/',           soloSuperAdmin, adminController.listarAdmins);
router.post('/invitar',   soloSuperAdmin, adminController.invitarAdmin);
router.patch('/:id/toggle', soloSuperAdmin, adminController.toggleAdmin);
router.delete('/:id',    soloSuperAdmin, adminController.eliminarAdmin);

module.exports = router;