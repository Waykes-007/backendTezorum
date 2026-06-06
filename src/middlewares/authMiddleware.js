const jwt     = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Cliente con service role para leer tabla admins sin RLS
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const supabase = require('../config/supabase');

const authMiddleware = {

  // ── Verifica token de usuario de la app (Flutter) ───────────────────────────
  verificarToken: async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No hay token de autenticación' });

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ message: 'Token inválido o expirado' });
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Error de autenticación' });
    }
  },

  // ── Verifica que sea admin (cualquier rol) ──────────────────────────────────
  soloAdmin: async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    try {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
      const email   = decoded.email;

      const { data: admin, error } = await supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo')
        .eq('email', email)
        .single();

      if (error || !admin) return res.status(403).json({ error: 'No es administrador' });
      if (!admin.activo)   return res.status(403).json({ error: 'Cuenta de administrador desactivada' });

      req.adminId    = admin.id;
      req.adminEmail = admin.email;
      req.adminRol   = admin.rol;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  },

  // ── Verifica que sea Super Admin ────────────────────────────────────────────
  soloSuperAdmin: async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    try {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
      const email   = decoded.email;

      const { data: admin, error } = await supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo')
        .eq('email', email)
        .single();

      if (error || !admin)           return res.status(403).json({ error: 'No es administrador' });
      if (!admin.activo)             return res.status(403).json({ error: 'Cuenta desactivada' });
      if (admin.rol !== 'super_admin') return res.status(403).json({ error: 'Se requiere rol de Super Administrador' });

      req.adminId    = admin.id;
      req.adminEmail = admin.email;
      req.adminRol   = admin.rol;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  },
};

module.exports = authMiddleware;