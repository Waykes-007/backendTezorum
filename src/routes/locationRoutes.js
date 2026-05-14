const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

router.get('/departamentos', locationController.getDepartamentos);
router.get('/provincias/:depId', locationController.getProvincias);
router.get('/distritos/:provId', locationController.getDistritos);

module.exports = router;