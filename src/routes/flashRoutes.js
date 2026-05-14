const express = require('express');
const router = express.Router();
const flashController = require('../controllers/flashController');

// Esta es la ruta que corregirá el error de 'undefined_method' en tu App
router.get('/activas', flashController.getOfertasActivas);

module.exports = router;