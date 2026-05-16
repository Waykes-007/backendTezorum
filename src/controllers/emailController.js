const { Resend } = require('resend');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');

const resend = new Resend(process.env.RESEND_API_KEY);

const metodoPagoNombre = (metodo) => {
  const map = {
    visa:          'Visa',
    master:        'Mastercard',
    amex:          'American Express',
    yape:          'Yape',
    plin:          'Plin',
    pago_efectivo: 'PagoEfectivo',
    debvisa:       'Visa Débito',
    debmaster:     'Mastercard Débito',
  };
  return map[metodo] || metodo || 'No especificado';
};

const enviarTicketCompra = async ({ pedido, cliente, items, pago }) => {
  try {
    // ── 1. QR ────────────────────────────────────────────────────────────
    const qrBuffer = await QRCode.toBuffer(
      `https://backendtezorum.onrender.com/pedido/${pedido.id}`,
      { width: 200, margin: 2 }
    );
    const fileName = `qr_${pedido.id}.png`;
    await supabase.storage.from('qr-pedidos').upload(fileName, qrBuffer, {
      contentType: 'image/png', upsert: true,
    });
    const { data: urlData } = supabase.storage.from('qr-pedidos').getPublicUrl(fileName);
    const qrUrl = urlData.publicUrl;

    // ── 2. Fecha prometida ───────────────────────────────────────────────
    const fechaEntrega = new Date();
    fechaEntrega.setDate(fechaEntrega.getDate() + 3);
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaTexto = `el ${dias[fechaEntrega.getDay()]} ${fechaEntrega.getDate()} de ${meses[fechaEntrega.getMonth()]}`;

    // ── 3. Items HTML ────────────────────────────────────────────────────
    const itemsHTML = items.map(item => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px;">
          <strong>${item.cantidad}x ${item.nombre}</strong>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-size:15px;font-weight:bold;">
          S/${(item.precio * item.cantidad).toFixed(2)}
        </td>
      </tr>
    `).join('');

    // ── 4. Sección método de pago ────────────────────────────────────────
    const pagoHTML = pago ? `
      <div style="padding:20px 24px;border-bottom:2px dashed #ddd;background:#f9fafb;">
        <p style="margin:0 0 12px;font-size:14px;color:#666;font-weight:bold;">💳 Método de pago</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:14px;color:#444;padding:4px 0;">Método:</td>
            <td style="font-size:14px;font-weight:bold;text-align:right;">${metodoPagoNombre(pago.metodo_pago)}</td>
          </tr>
          ${pago.banco ? `
          <tr>
            <td style="font-size:14px;color:#444;padding:4px 0;">Banco:</td>
            <td style="font-size:14px;font-weight:bold;text-align:right;">${pago.banco}</td>
          </tr>` : ''}
          ${pago.ultimos_4_digitos ? `
          <tr>
            <td style="font-size:14px;color:#444;padding:4px 0;">Tarjeta:</td>
            <td style="font-size:14px;font-weight:bold;text-align:right;">•••• •••• •••• ${pago.ultimos_4_digitos}</td>
          </tr>` : ''}
          ${pago.nombre_titular ? `
          <tr>
            <td style="font-size:14px;color:#444;padding:4px 0;">Titular:</td>
            <td style="font-size:14px;font-weight:bold;text-align:right;">${pago.nombre_titular}</td>
          </tr>` : ''}
          <tr>
            <td style="font-size:14px;color:#444;padding:4px 0;">Estado:</td>
            <td style="font-size:14px;font-weight:bold;text-align:right;color:#16a34a;">✅ Aprobado</td>
          </tr>
        </table>
      </div>
    ` : '';

    // ── 5. HTML completo ─────────────────────────────────────────────────
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:20px;background:#f5f5f5;font-family:Arial,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:white;border:2px dashed #ccc;border-radius:8px;overflow:hidden;">

        <div style="background:#6B21A8;padding:24px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:26px;font-weight:900;">¡Tezórum! 🛍️</h1>
        </div>

        <div style="padding:24px;text-align:center;border-bottom:2px dashed #ddd;">
          <h2 style="color:#1a1a1a;margin:0;font-size:22px;font-weight:900;">
            ¡${cliente.nombre}, tu compra fue<br/>exitosa!, Gracias por<br/>comprar en <em>Tezórum</em>
          </h2>
        </div>

        <div style="padding:20px 24px;border-bottom:2px dashed #ddd;">
          <table style="width:100%;">
            <tr>
              <td style="font-size:14px;color:#444;">Número de Pedido:</td>
              <td style="text-align:right;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:2px;">
                ${pedido.numero}
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:6px;font-size:14px;font-weight:bold;color:#1a1a1a;">
                Llega ${fechaTexto}
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:24px;text-align:center;border-bottom:2px dashed #ddd;">
          <img src="${qrUrl}" width="180" height="180" style="display:block;margin:0 auto;"/>
        </div>

        <div style="margin:0 24px;padding:12px;background:#FFF9C4;border-radius:8px;text-align:center;border-bottom:2px dashed #ddd;">
          <p style="margin:0;font-size:14px;font-weight:bold;color:#5a4000;">
            Nos contactaremos contigo<br/>para entregar tu pedido
          </p>
        </div>

        <div style="padding:20px 24px;border-bottom:2px dashed #ddd;">
          <p style="margin:0 0 12px;font-size:14px;color:#666;font-weight:bold;">Resumen</p>
          <table style="width:100%;border-collapse:collapse;">
            ${itemsHTML}
            <tr>
              <td style="padding:10px 0;color:#666;font-size:14px;">(Costo de Envío)</td>
              <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:bold;color:${pedido.costo_envio == 0 ? '#16a34a' : '#1a1a1a'};">
                ${pedido.costo_envio == 0 ? 'Gratis 🎉' : `S/${parseFloat(pedido.costo_envio).toFixed(2)}`}
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:16px 24px;text-align:right;border-bottom:2px dashed #ddd;">
          <span style="font-size:18px;font-weight:900;color:#1a1a1a;">
            TOTAL S/ ${parseFloat(pedido.monto_total_pagar).toFixed(2)}
          </span>
        </div>

        ${pagoHTML}

        <div style="padding:20px 24px;border-bottom:2px dashed #ddd;background:#f9fafb;">
          <p style="margin:0 0 8px;font-size:14px;color:#666;font-weight:bold;">📦 Datos de entrega</p>
          <p style="margin:4px 0;font-size:14px;color:#444;">👤 ${cliente.nombre}</p>
          <p style="margin:4px 0;font-size:14px;color:#444;">📍 ${pedido.direccion_envio}</p>
          <p style="margin:4px 0;font-size:14px;color:#444;">📱 ${cliente.whatsapp}</p>
          <p style="margin:4px 0;font-size:14px;color:#444;">🪪 DNI: ${cliente.dni}</p>
        </div>

        <div style="padding:20px 24px;text-align:center;background:#faf5ff;">
          <p style="margin:0;color:#6B21A8;font-size:13px;">¿Tienes alguna duda? Escríbenos por WhatsApp</p>
          <p style="margin:8px 0 0;font-weight:bold;color:#6B21A8;">Tezórum 💜</p>
        </div>

      </div>
    </body>
    </html>
    `;

    await resend.emails.send({
      from:    'Tezórum <onboarding@resend.dev>',
      to:      cliente.correo,
      subject: `✅ ¡Tu pedido #${pedido.numero} fue confirmado! - Tezórum`,
      html,
    });

    console.log(`✅ Ticket enviado a ${cliente.correo}`);
  } catch (error) {
    console.error('❌ Error al enviar ticket:', error);
  }
};

module.exports = { enviarTicketCompra };