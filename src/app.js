const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');
const locationRoutes = require('./routes/locationRoutes');
const flashRoutes = require('./routes/flashRoutes');
const adminRoutes = require('./routes/adminRoutes');
const planRoutes = require('./routes/planRoutes')
const subUsuarioRoutes = require('./routes/subUsuarioRoutes')
const sharfRoutes = require('./routes/sharfRoutes')


const app = express();

// Middlewares
app.use(cors()); // Permite conexiones desde el dispositivo móvil

app.use(express.json()); // Permite recibir JSON en las peticiones
app.use(express.urlencoded({ extended: true })); // ← agrega esto
app.use('/api/plan', planRoutes)
app.use('/api/subusuarios', subUsuarioRoutes)
app.use('/api/sharf', sharfRoutes)

// DIAGNÓSTICO TEMPORAL
app.use((req, res, next) => {
  if (req.path.includes('izipay') || req.path.includes('exito')) {
    console.log(`📨 ${req.method} ${req.path}`);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body ?? {}));
  }
  next();
});

// Rutas

app.use('/api/admins', adminRoutes);
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