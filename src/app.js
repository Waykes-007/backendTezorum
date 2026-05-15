const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');
const locationRoutes = require('./routes/locationRoutes');
const flashRoutes = require('./routes/flashRoutes');


const app = express();

// Middlewares
app.use(cors()); // Permite conexiones desde el dispositivo móvil
app.use(express.json()); // Permite recibir JSON en las peticiones

// Rutas
app.use('/api', apiRoutes);

app.use('/webhooks', webhookRoutes);
app.use('/api/ubicacion', locationRoutes);
app.use('/api/ofertas-flash', flashRoutes);

// Manejo de errores básico
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Algo salió mal en el servidor' });
});

module.exports = app;