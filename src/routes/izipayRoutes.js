const express    = require('express');
const router     = express.Router();
const { crearFormToken, webhook } = require('../controllers/izipayController');

router.post('/crear-form-token', crearFormToken);
router.post('/webhook',          webhook);
router.get('/webhook', (req, res) => {
  res.status(200).send('OK');
});

router.post('/webhook', webhook);

module.exports = router;