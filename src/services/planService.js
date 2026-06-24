const { Resend } = require('resend')
const supabase   = require('../config/supabase')

const resend = new Resend(process.env.RESEND_API_KEY)

// ── Precios oficiales ─────────────────────────────────────────────────────────
const PRECIOS = {
  mensual:     { precio: 65.00,  meses: 1  },
  trimestral:  { precio: 177.00, meses: 3  },
  semestral:   { precio: 292.50, meses: 6  },
  anual:       { precio: 468.00, meses: 12 },
}

// ── Calcular fecha de vencimiento según duración ──────────────────────────────
function calcularFechaFin(duracion) {
  const inicio = new Date()
  const fin    = new Date()
  fin.setMonth(fin.getMonth() + PRECIOS[duracion].meses)
  return { inicio, fin }
}

// ── Activar plan Oro (llamado desde admin) ────────────────────────────────────
async function activarPlanOro(tiendaId, duracion) {
  if (!PRECIOS[duracion]) throw new Error(`Duración inválida: ${duracion}`)

  const { inicio, fin } = calcularFechaFin(duracion)
  const precio          = PRECIOS[duracion].precio

  const { data: tienda, error } = await supabase
    .from('tiendas')
    .update({
      plan:                      'oro',
      es_vendedor_oro:           true,
      tienda_verificada:         true,
      plan_inicio:               inicio.toISOString().split('T')[0],
      plan_fin:                  fin.toISOString().split('T')[0],
      plan_duracion:             duracion,
      plan_precio:               precio,
      aviso_vencimiento_enviado: false,
    })
    .eq('id', tiendaId)
    .select('id, nombre_tienda, email, plan_fin')
    .single()

  if (error) throw error

  // Enviar correo de bienvenida Oro
  await enviarBienvenidaOro(tienda, duracion, precio, fin)

  return tienda
}

// ── Degradar plan a Clásico manualmente (admin) ───────────────────────────────
async function degradarPlanClasico(tiendaId) {
  const { error } = await supabase
    .from('tiendas')
    .update({
      plan:                      'clasico',
      es_vendedor_oro:           false,
      plan_inicio:               null,
      plan_fin:                  null,
      plan_duracion:             null,
      plan_precio:               null,
      aviso_vencimiento_enviado: false,
    })
    .eq('id', tiendaId)

  if (error) throw error
}

// ── Enviar avisos de vencimiento (llamado por cron) ───────────────────────────
async function enviarAvisosVencimiento() {
  // Buscar tiendas marcadas para aviso (pg_cron las marca en aviso_vencimiento_enviado=true)
  // pero que aún no recibieron el correo — usamos un campo extra o verificamos plan_fin
  const hoy        = new Date()
  const en7dias    = new Date()
  en7dias.setDate(en7dias.getDate() + 7)
  const fechaStr   = en7dias.toISOString().split('T')[0]

  const { data: tiendas, error } = await supabase
    .from('tiendas')
    .select('id, nombre_tienda, email, plan_fin, plan_duracion, plan_precio')
    .eq('plan', 'oro')
    .eq('plan_fin', fechaStr)
    .eq('aviso_vencimiento_enviado', false)

  if (error) { console.error('❌ Error buscando avisos:', error.message); return }
  if (!tiendas?.length) { console.log('✅ Sin avisos de vencimiento hoy'); return }

  console.log(`📧 Enviando ${tiendas.length} avisos de vencimiento...`)

  for (const tienda of tiendas) {
    try {
      await enviarAvisoVencimiento(tienda)
      // Marcar como enviado
      await supabase.from('tiendas')
        .update({ aviso_vencimiento_enviado: true })
        .eq('id', tienda.id)
      console.log(`✅ Aviso enviado: ${tienda.email}`)
    } catch (err) {
      console.error(`❌ Error enviando aviso a ${tienda.email}:`, err.message)
    }
  }
}

// ── Email: bienvenida plan Oro ────────────────────────────────────────────────
async function enviarBienvenidaOro(tienda, duracion, precio, fechaFin) {
  const duracionLabel = {
    mensual:    '1 mes',
    trimestral: '3 meses',
    semestral:  '6 meses',
    anual:      '12 meses',
  }[duracion] ?? duracion

  const fechaFinStr = new Date(fechaFin).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:20px;background:#f5f5f5;font-family:Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

      <div style="background:linear-gradient(135deg,#6B21A8,#9333EA);padding:32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:28px;font-weight:900;">⭐ ¡Bienvenido a Oro!</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">
          Tu tienda ahora tiene superpoderes
        </p>
      </div>

      <div style="padding:28px;">
        <p style="color:#334155;font-size:16px;margin:0 0 8px;">
          Hola, <strong>${tienda.nombre_tienda}</strong> 👋
        </p>
        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Tu plan <strong style="color:#6B21A8;">Vendedor Oro</strong> ha sido activado exitosamente.
          A partir de ahora tienes acceso a todos los beneficios premium de Waykes.
        </p>

        <!-- Detalles del plan -->
        <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:900;color:#6B21A8;text-transform:uppercase;letter-spacing:0.05em;">
            Detalles de tu plan
          </p>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">Plan:</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;color:#6B21A8;">⭐ Vendedor Oro</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">Duración:</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;">${duracionLabel}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">Monto pagado:</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;">S/ ${parseFloat(precio).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">Vence el:</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;color:#dc2626;">${fechaFinStr}</td>
            </tr>
          </table>
        </div>

        <!-- Beneficios -->
        <p style="font-size:13px;font-weight:900;color:#334155;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">
          Tus beneficios activos
        </p>
        <div style="space-y:8px;">
          ${[
            '✅ Productos ilimitados',
            '✅ Promos ilimitadas',
            '✅ Insignias Oro y Verificado',
            '✅ Primeras posiciones en búsquedas',
            '✅ Analítica y estadísticas de negocio',
            '✅ Herramientas de marketing (cupones, descuentos)',
            '✅ Hasta 3 sub-usuarios',
            '✅ Banner en tu tienda',
            '✅ Soporte por WhatsApp',
          ].map(b => `<p style="margin:6px 0;font-size:13px;color:#374151;">${b}</p>`).join('')}
        </div>

        <a href="https://vendedor.waykes.com" 
          style="display:block;background:#6B21A8;color:white;text-decoration:none;font-weight:bold;
          font-size:15px;padding:16px;border-radius:12px;text-align:center;margin-top:24px;">
          Ir a mi panel de vendedor →
        </a>
      </div>

      <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">
          ¿Tienes dudas? Escríbenos a soporte@waykes.com
        </p>
        <p style="color:#6B21A8;font-weight:bold;font-size:13px;margin:6px 0 0;">Waykes 💜</p>
      </div>
    </div>
  </body>
  </html>`

  await resend.emails.send({
    from:    'Waykes <noreply@waykes.com>',
    to:      tienda.email,
    subject: '⭐ ¡Tu plan Oro está activo! — Waykes',
    html,
  })
}

// ── Email: aviso de vencimiento (7 días antes) ────────────────────────────────
async function enviarAvisoVencimiento(tienda) {
  const fechaFinStr = new Date(tienda.plan_fin).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:20px;background:#f5f5f5;font-family:Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

      <div style="background:linear-gradient(135deg,#b45309,#d97706);padding:32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:26px;font-weight:900;">⚠️ Tu plan Oro vence pronto</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">
          Quedan 7 días para renovar
        </p>
      </div>

      <div style="padding:28px;">
        <p style="color:#334155;font-size:16px;margin:0 0 8px;">
          Hola, <strong>${tienda.nombre_tienda}</strong> 👋
        </p>
        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Te recordamos que tu plan <strong style="color:#6B21A8;">Vendedor Oro</strong> vence el 
          <strong style="color:#dc2626;">${fechaFinStr}</strong>.
        </p>

        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:16px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-weight:bold;">
            ⏰ Si no renuevas, tu tienda volverá automáticamente al plan Clásico y perderás:
          </p>
          <ul style="margin:8px 0 0;padding-left:20px;color:#92400e;font-size:13px;">
            <li>Las insignias Oro y Verificado</li>
            <li>El posicionamiento en primeras búsquedas</li>
            <li>Los productos ilimitados (límite de 20)</li>
            <li>Las herramientas de marketing</li>
            <li>El acceso de tus sub-usuarios</li>
          </ul>
        </div>

        <p style="color:#64748b;font-size:13px;margin:0 0 16px;">
          Para renovar tu plan, contáctanos por WhatsApp o escríbenos a soporte@waykes.com
          y te ayudaremos con el proceso.
        </p>

        <a href="https://wa.me/51999999999?text=Hola%20Waykes%2C%20quiero%20renovar%20mi%20plan%20Oro"
          style="display:block;background:#16a34a;color:white;text-decoration:none;font-weight:bold;
          font-size:15px;padding:16px;border-radius:12px;text-align:center;margin-bottom:12px;">
          💬 Renovar por WhatsApp
        </a>

        <a href="mailto:soporte@waykes.com?subject=Renovación%20Plan%20Oro%20-%20${encodeURIComponent(tienda.nombre_tienda)}"
          style="display:block;background:#6B21A8;color:white;text-decoration:none;font-weight:bold;
          font-size:15px;padding:16px;border-radius:12px;text-align:center;">
          📧 Renovar por correo
        </a>
      </div>

      <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">Waykes · Panel de Vendedor</p>
        <p style="color:#6B21A8;font-weight:bold;font-size:13px;margin:6px 0 0;">Waykes 💜</p>
      </div>
    </div>
  </body>
  </html>`

  await resend.emails.send({
    from:    'Waykes <noreply@waykes.com>',
    to:      tienda.email,
    subject: `⚠️ Tu plan Oro vence en 7 días — Waykes`,
    html,
  })
}

module.exports = { activarPlanOro, degradarPlanClasico, enviarAvisosVencimiento, PRECIOS }