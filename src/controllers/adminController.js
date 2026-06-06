const supabase = require('../config/supabase');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Crear cliente Supabase con Service Role Key ───────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const adminController = {

  // ── Listar todos los admins ─────────────────────────────────────────────────
  async listarAdmins(req, res) {
    try {
      const { data, error } = await supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo, fecha_creacion, creado_por')
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    } catch (e) {
      console.error('❌ listarAdmins:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Invitar nuevo admin ─────────────────────────────────────────────────────
  async invitarAdmin(req, res) {
    const { email, nombre, rol } = req.body;
    const creadoPorId = req.adminId; // viene del middleware

    if (!email || !nombre || !rol) {
      return res.status(400).json({ error: 'Email, nombre y rol son requeridos' });
    }
    if (!['super_admin', 'admin'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    try {
      // 1. Verificar que el email no esté ya registrado en la tabla admins
      const { data: existe } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('email', email)
        .single();

      if (existe) {
        return res.status(400).json({ error: 'Ya existe un administrador con ese email' });
      }

      // 2. Insertar en tabla admins PRIMERO (antes de crear en auth)
      const { error: insertError } = await supabaseAdmin
        .from('admins')
        .insert([{
          email,
          nombre,
          rol,
          activo: false,
          creado_por: creadoPorId ?? null,
        }]);
      if (insertError) throw insertError;

      // 3. Generar link de invitación con Supabase Auth (ahora el trigger ya encontrará al admin)
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: `${process.env.ADMIN_DASHBOARD_URL ?? 'http://localhost:5173'}/admin/set-password`,
          data: { nombre, rol, es_admin: true },
        },
      });
      if (linkError) {
        // Si falla el link, revertir el insert para no dejar datos huérfanos
        await supabaseAdmin.from('admins').delete().eq('email', email);
        throw linkError;
      }

      // 4. Enviar correo de invitación con Resend
      const inviteUrl = linkData.properties?.action_link;
      await resend.emails.send({
        from: 'Tezórum <onboarding@resend.dev>',
        to: email,
        subject: '🛡️ Invitación al Panel Administrativo — Tezórum',
        html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
          <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            <div style="background:linear-gradient(135deg,#1e1b4b,#4338ca);padding:32px;text-align:center;">
              <h1 style="color:white;margin:0;font-size:24px;font-weight:900;">🛡️ TEZÓRUM ADMIN</h1>
              <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">Panel de Control Administrativo</p>
            </div>

            <div style="padding:32px;">
              <p style="color:#334155;font-size:16px;margin:0 0 8px;">Hola, <strong>${nombre}</strong> 👋</p>
              <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Has sido invitado a unirte al panel administrativo de <strong>Tezórum</strong>
                con el rol de <strong style="color:#4338ca;">${rol === 'super_admin' ? 'Super Administrador' : 'Administrador'}</strong>.
              </p>

              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:24px;">
                <p style="color:#64748b;font-size:12px;margin:0 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">Tu acceso</p>
                <p style="color:#1e293b;font-size:14px;margin:0;">📧 ${email}</p>
                <p style="color:#1e293b;font-size:14px;margin:4px 0 0;">🎭 ${rol === 'super_admin' ? 'Super Administrador' : 'Administrador'}</p>
              </div>

              <p style="color:#64748b;font-size:13px;margin:0 0 16px;">
                Haz clic en el botón para crear tu contraseña y acceder al sistema:
              </p>

              <a href="${inviteUrl}"
                style="display:block;background:#4338ca;color:white;text-decoration:none;font-weight:bold;font-size:15px;padding:16px;border-radius:12px;text-align:center;margin-bottom:24px;">
                ✅ Aceptar invitación y crear contraseña
              </a>

              <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:12px;">
                <p style="color:#92400e;font-size:12px;margin:0;font-weight:bold;">
                  ⚠️ Este enlace expira en 24 horas. Si no solicitaste esta invitación, ignora este correo.
                </p>
              </div>
            </div>

            <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="color:#94a3b8;font-size:12px;margin:0;">Tezórum · Sistema de Gestión Administrativo</p>
            </div>
          </div>
        </body>
        </html>
        `,
      });

      console.log(`✅ Invitación enviada a ${email} como ${rol}`);
      return res.status(201).json({ message: `Invitación enviada a ${email}` });

    } catch (e) {
      console.error('❌ invitarAdmin:', e.message);
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Activar admin (cuando acepta la invitación) ─────────────────────────────
  async activarAdmin(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    try {
      const { error } = await supabaseAdmin
        .from('admins')
        .update({ activo: true })
        .eq('email', email);

      if (error) throw error;
      return res.status(200).json({ message: 'Admin activado' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Cambiar estado activo/inactivo ──────────────────────────────────────────
  async toggleAdmin(req, res) {
    const { id } = req.params;
    const { activo } = req.body;

    try {
      // No permitir desactivar al propio super admin que hace la petición
      const { data: target } = await supabaseAdmin
        .from('admins').select('email, rol').eq('id', id).single();

      if (target?.email === req.adminEmail) {
        return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
      }

      const { error } = await supabaseAdmin
        .from('admins').update({ activo }).eq('id', id);

      if (error) throw error;
      return res.status(200).json({ message: `Admin ${activo ? 'activado' : 'desactivado'}` });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Eliminar admin ──────────────────────────────────────────────────────────
  async eliminarAdmin(req, res) {
    const { id } = req.params;

    try {
      const { data: target } = await supabaseAdmin
        .from('admins').select('email, rol').eq('id', id).single();

      if (!target) return res.status(404).json({ error: 'Admin no encontrado' });
      if (target.email === req.adminEmail) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
      }

      // Eliminar de auth.users también
      const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
      const userToDelete = authUser?.users?.find(u => u.email === target.email);
      if (userToDelete) {
        await supabaseAdmin.auth.admin.deleteUser(userToDelete.id);
      }

      // Eliminar de tabla admins
      const { error } = await supabaseAdmin.from('admins').delete().eq('id', id);
      if (error) throw error;

      return res.status(200).json({ message: 'Admin eliminado correctamente' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Verificar si un email es admin (usado en login del dashboard) ───────────
  async verificarAdmin(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    try {
      const { data, error } = await supabaseAdmin
        .from('admins')
        .select('id, email, nombre, rol, activo')
        .eq('email', email)
        .single();

      if (error || !data) return res.status(404).json({ error: 'No es administrador' });
      if (!data.activo) return res.status(403).json({ error: 'Cuenta desactivada' });

      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
};

module.exports = adminController;