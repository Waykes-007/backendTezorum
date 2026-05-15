const express    = require('express');
const router     = express.Router();
const { crearPreferencia, webhook } = require('../controllers/pagoController');

router.post('/crear-preferencia', crearPreferencia);
router.post('/webhook',           webhook);

module.exports = router;