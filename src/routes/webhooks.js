const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');
const supabase = require('../config/supabase');

router.post('/pago-confirmado', async (req, res) => {
    // La estructura de 'req.body' dependerá de la pasarela que elijas
    const { orderId, status, amount, userId } = req.body;

    if (status === 'SUCCESS') {
        try {
            // 1. Actualizamos el estado del pedido en la DB
            await supabase
                .from('pedidos')
                .update({ estado_pedido: 'pagado' })
                .eq('id', orderId);

            // 2. Si el pago fue para recargar billetera, sumamos el saldo
            await walletService.procesarTransaccion(
                userId, 
                amount, 
                'ingreso', 
                `Recarga de saldo confirmada - Orden #${orderId}`
            );

            res.status(200).send('Webhook procesado');
        } catch (error) {
            res.status(500).send('Error procesando el pago');
        }
    } else {
        res.status(400).send('Pago no exitoso');
    }
});

module.exports = router;