const express          = require('express');
const cors             = require('cors');
const apiRoutes        = require('./routes/api');
const webhookRoutes    = require('./routes/webhooks');
const locationRoutes   = require('./routes/locationRoutes');
const adminRoutes      = require('./routes/adminRoutes');
const planRoutes       = require('./routes/planRoutes');
const subUsuarioRoutes = require('./routes/subUsuarioRoutes');
const sharfRoutes      = require('./routes/sharfRoutes');      // ← corregido
const nuevasRoutes     = require('./routes/nuevasRoutes');     // ← nuevo
const supabase         = require('./config/supabase');
const { iniciarJobExpiracion } = require('./jobs/expirarOfertasFlash');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas específicas
app.use('/api/plan',        planRoutes);
app.use('/api/subusuarios', subUsuarioRoutes);
app.use('/api/sharf',       sharfRoutes);
app.use('/api/admins',      adminRoutes);

// Diagnóstico temporal
app.use((req, res, next) => {
  if (req.path.includes('izipay') || req.path.includes('exito')) {
    console.log(`📨 ${req.method} ${req.path}`);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body ?? {}));
  }
  next();
});

// Rutas generales — nuevasRoutes ANTES de apiRoutes
app.use('/api',       nuevasRoutes);
app.use('/api',       apiRoutes);
app.use('/webhooks',  webhookRoutes);
app.use('/api/ubicacion',    locationRoutes);

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Algo salió mal en el servidor' });
});

// ── Job de expiración automática de ofertas flash ──────────
// Revisa cada 30s ofertas vencidas (por tiempo o agotadas por
// cantidad) y las desactiva + limpia precio_flash del producto.
iniciarJobExpiracion(supabase, 30000);

module.exports = app;