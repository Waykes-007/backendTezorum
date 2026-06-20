const supabase = require('../config/supabase');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Roles válidos y sus labels ─────────────────────────────────────────────────
const ROLES_VALIDOS = ['super_admin', 'admin', 'almacen'];

const LABEL_ROL = {
  super_admin: 'Super Administrador',
  admin:       'Administrador',
  almacen:     'Operador de Almacén',
};

// URL del dashboard según el rol
function getDashboardUrl(rol) {
  if (rol === 'almacen') {
    return process.env.ALMACEN_DASHBOARD_URL ?? 'https://almacen.waykes.com';
  }
  return process.env.ADMIN_DASHBOARD_URL ?? 'https://admin.waykes.com';
}

// ── Quién puede invitar a quién ────────────────────────────────────────────────
const PERMISOS_INVITAR = {
  super_admin: ['super_admin', 'admin', 'almacen'],
  admin:       ['almacen'],
  almacen:     [],
};

const adminController = {

  // ── Listar todos los admins ─────────────────────────────────────────────────
  async listarAdmins(req, res) {
    try {
      const { rol: rolSolicitante } = req;   // viene del middleware auth

      let query = supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo, fecha_creacion, creado_por')
        .order('fecha_creacion', { ascending: false });

      // Los admins normales solo ven operadores de almacén
      if (rolSolicitante === 'admin') {
        query = query.eq('rol', 'almacen');
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    } catch (e) {
      console.error('❌ listarAdmins:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Invitar nuevo admin / operador ─────────────────────────────────────────
  async invitarAdmin(req, res) {
    const { email, nombre, rol } = req.body;
    const creadoPorId    = req.adminId;
    const rolSolicitante = req.rol;

    if (!email || !nombre || !rol) {
      return res.status(400).json({ error: 'Email, nombre y rol son requeridos' });
    }

    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser: ${ROLES_VALIDOS.join(', ')}` });
    }

    // Verificar que el solicitante puede crear este rol
    const rolesPermitidos = PERMISOS_INVITAR[rolSolicitante] ?? [];
    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({
        error: `Tu rol (${rolSolicitante}) no puede crear usuarios con rol "${rol}"`,
      });
    }

    try {
      // ¿Ya existe?
      const { data: existe } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('email', email)
        .single();

      if (existe) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
      }

      // Insertar en tabla admins
      const { error: insertError } = await supabaseAdmin
        .from('admins')
        .insert([{
          email,
          nombre,
          rol,
          activo:     false,
          creado_por: creadoPorId ?? null,
        }]);
      if (insertError) throw insertError;

      // Generar link de invitación de Supabase Auth
      const redirectTo = `${getDashboardUrl(rol)}/set-password`;
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type:  'invite',
        email,
        options: {
          redirectTo,
          data: { nombre, rol, es_admin: true },
        },
      });

      if (linkError) {
        await supabaseAdmin.from('admins').delete().eq('email', email);
        throw linkError;
      }

      const inviteUrl = linkData.properties?.action_link;

      // ── Email según rol ────────────────────────────────────────────────────
      const esAlmacen = rol === 'almacen';

      await resend.emails.send({
        from:    'Waykes <noreply@waykes.com>',
        to:      email,
        subject: esAlmacen
          ? '📦 Acceso al Panel de Almacén — Waykes'
          : '🛡️ Invitación al Panel Administrativo — Waykes',
        html: buildEmailHtml({ nombre, email, rol, inviteUrl, esAlmacen }),
      });

      console.log(`✅ Invitación enviada a ${email} como ${rol}`);
      return res.status(201).json({
        message: `Invitación enviada a ${email} con rol "${LABEL_ROL[rol]}"`,
      });

    } catch (e) {
      console.error('❌ invitarAdmin:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Activar admin/operador por email ────────────────────────────────────────
  async activarAdmin(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    try {
      const { error } = await supabaseAdmin
        .from('admins')
        .update({ activo: true })
        .eq('email', email);

      if (error) throw error;
      return res.status(200).json({ message: 'Usuario activado correctamente' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Toggle activo/inactivo ──────────────────────────────────────────────────
  async toggleAdmin(req, res) {
    const { id }    = req.params;
    const { activo } = req.body;

    try {
      const { data: target } = await supabaseAdmin
        .from('admins').select('email, rol').eq('id', id).single();

      if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

      if (target.email === req.adminEmail) {
        return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
      }

      // admin solo puede tocar operadores de almacén
      if (req.rol === 'admin' && target.rol !== 'almacen') {
        return res.status(403).json({ error: 'Sin permiso para modificar este usuario' });
      }

      const { error } = await supabaseAdmin
        .from('admins').update({ activo }).eq('id', id);

      if (error) throw error;
      return res.status(200).json({
        message: `Usuario ${activo ? 'activado' : 'desactivado'} correctamente`,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Eliminar admin / operador ───────────────────────────────────────────────
  async eliminarAdmin(req, res) {
    const { id } = req.params;

    try {
      const { data: target } = await supabaseAdmin
        .from('admins').select('email, rol').eq('id', id).single();

      if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

      if (target.email === req.adminEmail) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
      }

      // admin solo puede eliminar operadores de almacén
      if (req.rol === 'admin' && target.rol !== 'almacen') {
        return res.status(403).json({ error: 'Sin permiso para eliminar este usuario' });
      }

      // Eliminar de Supabase Auth
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers();
      const userToDelete = authList?.users?.find(u => u.email === target.email);
      if (userToDelete) {
        await supabaseAdmin.auth.admin.deleteUser(userToDelete.id);
      }

      // Eliminar de tabla admins
      const { error } = await supabaseAdmin.from('admins').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ message: 'Usuario eliminado correctamente' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Verificar si un email es admin / operador ──────────────────────────────
  async verificarAdmin(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    try {
      const { data, error } = await supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo')
        .eq('email', email)
        .single();

      if (error || !data) return res.status(404).json({ error: 'No encontrado en el sistema' });
      if (!data.activo) return res.status(403).json({ error: 'Cuenta desactivada' });

      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Listar solo operadores de almacén ─────────────────────────────────────
  async listarOperadoresAlmacen(req, res) {
    try {
      const { data, error } = await supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo, fecha_creacion')
        .eq('rol', 'almacen')
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
};

// ── HTML del email de invitación ──────────────────────────────────────────────
function buildEmailHtml({ nombre, email, rol, inviteUrl, esAlmacen }) {
  const accentColor  = esAlmacen ? '#7c3aed' : '#4338ca';
  const gradientFrom = esAlmacen ? '#1e1028' : '#1e1b4b';
  const emoji        = esAlmacen ? '📦' : '🛡️';
  const panelLabel   = esAlmacen ? 'Panel de Almacén' : 'Panel Administrativo';
  const rolLabel     = LABEL_ROL[rol] ?? rol;

  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,${gradientFrom},${accentColor});padding:32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:24px;font-weight:900;">${emoji} WAYKES</h1>
        <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">${panelLabel}</p>
      </div>

      <div style="padding:32px;">
        <p style="color:#334155;font-size:16px;margin:0 0 8px;">Hola, <strong>${nombre}</strong> 👋</p>
        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Has sido invitado a acceder al <strong>${panelLabel}</strong> de Waykes
          con el rol de <strong style="color:${accentColor};">${rolLabel}</strong>.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:24px;">
          <p style="color:#64748b;font-size:12px;margin:0 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">Tu acceso</p>
          <p style="color:#1e293b;font-size:14px;margin:0;">📧 ${email}</p>
          <p style="color:#1e293b;font-size:14px;margin:4px 0 0;">🎭 ${rolLabel}</p>
        </div>

        <p style="color:#64748b;font-size:13px;margin:0 0 16px;">
          Haz clic en el botón para crear tu contraseña y acceder al sistema:
        </p>

        <a href="${inviteUrl}"
          style="display:block;background:${accentColor};color:white;text-decoration:none;font-weight:bold;font-size:15px;padding:16px;border-radius:12px;text-align:center;margin-bottom:24px;">
          ✅ Aceptar invitación y crear contraseña
        </a>

        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:12px;">
          <p style="color:#92400e;font-size:12px;margin:0;font-weight:bold;">
            ⚠️ Este enlace expira en 24 horas. Si no solicitaste esta invitación, ignora este correo.
          </p>
        </div>
      </div>

      <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">Waykes · ${panelLabel}</p>
      </div>
    </div>
  </body>
  </html>`;
}

module.exports = adminController;