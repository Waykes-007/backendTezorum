const express = require('express');
const router  = express.Router();
const { crearFormToken, crearTokenYape, webhook } = require('../controllers/izipayController');

router.post('/crear-form-token', crearFormToken);
router.post('/crear-token-yape', crearTokenYape);  // ← nuevo
router.post('/webhook',          webhook);
router.get('/webhook', (req, res) => res.status(200).send('OK'));

module.exports = router;