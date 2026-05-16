const { Resend } = require('resend');
const QRCode = require('qrcode');

const resend = new Resend(process.env.RESEND_API_KEY);

const enviarTicketCompra = async ({ pedido, cliente, items }) => {
  try {
    // ── 1. Generar QR con el ID del pedido ──
    const qrDataUrl = await QRCode.toDataURL(`https://backendtezorum.onrender.com/pedido/${pedido.id}`, {
      width: 200,
      margin: 2,
    });
    const qrBase64 = qrDataUrl.split(',')[1];

    // ── 2. Construir lista de productos ──
    const itemsHTML = items.map(item => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
          ${item.cantidad}x <strong>${item.nombre}</strong>
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
          S/ ${(item.precio * item.cantidad).toFixed(2)}
        </td>
      </tr>
    `).join('');

    // ── 3. HTML del ticket ──
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
      <div style="max-width: 500px; margin: 30px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6B21A8, #9333EA); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">¡Tezórum! 🛍️</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">Tu compra fue exitosa</p>
        </div>

        <!-- Mensaje principal -->
        <div style="padding: 24px; text-align: center; border-bottom: 2px dashed #f0f0f0;">
          <h2 style="color: #1a1a1a; margin: 0 0 8px;">
            ¡${cliente.nombre}, gracias por tu compra!
          </h2>
          <p style="color: #666; margin: 0;">Nos contactaremos contigo para coordinar la entrega.</p>
        </div>

        <!-- Número de pedido -->
        <div style="padding: 20px 24px; text-align: center; background: #faf5ff; border-bottom: 2px dashed #f0f0f0;">
          <p style="color: #6B21A8; margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Número de Pedido</p>
          <h2 style="color: #1a1a1a; margin: 0; font-size: 32px; letter-spacing: 2px;">
            ${pedido.numero}
          </h2>
        </div>

        <!-- QR -->
        <div style="padding: 24px; text-align: center; border-bottom: 2px dashed #f0f0f0;">
          <p style="color: #666; font-size: 13px; margin: 0 0 12px;">Escanea para ver el estado de tu pedido</p>
          <img src="cid:qr_pedido" width="160" height="160" style="border-radius: 8px;"/>
        </div>

        <!-- Resumen de productos -->
        <div style="padding: 24px; border-bottom: 2px dashed #f0f0f0;">
          <h3 style="color: #1a1a1a; margin: 0 0 16px; font-size: 16px;">Resumen de tu pedido</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${itemsHTML}
            <tr>
              <td style="padding: 8px 0; color: #666;">Envío</td>
              <td style="padding: 8px 0; text-align: right; color: ${pedido.costo_envio == 0 ? '#16a34a' : '#1a1a1a'};">
                ${pedido.costo_envio == 0 ? 'Gratis 🎉' : `S/ ${parseFloat(pedido.costo_envio).toFixed(2)}`}
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0 0; font-weight: bold; font-size: 16px;">TOTAL</td>
              <td style="padding: 12px 0 0; text-align: right; font-weight: bold; font-size: 18px; color: #6B21A8;">
                S/ ${parseFloat(pedido.monto_total_pagar).toFixed(2)}
              </td>
            </tr>
          </table>
        </div>

        <!-- Datos de entrega -->
        <div style="padding: 24px; border-bottom: 2px dashed #f0f0f0; background: #f9fafb;">
          <h3 style="color: #1a1a1a; margin: 0 0 12px; font-size: 16px;">📦 Datos de entrega</h3>
          <p style="margin: 4px 0; color: #444; font-size: 14px;">📍 ${pedido.direccion_envio}</p>
          <p style="margin: 4px 0; color: #444; font-size: 14px;">📱 ${cliente.whatsapp}</p>
        </div>

        <!-- Footer -->
        <div style="padding: 20px 24px; text-align: center; background: #6B21A8;">
          <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 13px;">
            ¿Tienes alguna duda? Escríbenos por WhatsApp
          </p>
          <p style="color: white; margin: 8px 0 0; font-weight: bold;">Tezórum 💜</p>
        </div>

      </div>
    </body>
    </html>
    `;

    // ── 4. Enviar email ──
    await resend.emails.send({
      from:    'Tezórum <onboarding@resend.dev>', // cambiar por tu dominio cuando tengas
      to:      cliente.correo,
      subject: `✅ ¡Tu pedido #${pedido.numero} fue confirmado! - Tezórum`,
      html,
      attachments: [
        {
          filename:    'qr_pedido.png',
          content:     qrBase64,
          content_id:  'qr_pedido',
          encoding:    'base64',
        }
      ],
    });

    console.log(`✅ Ticket enviado a ${cliente.correo}`);
  } catch (error) {
    console.error('❌ Error al enviar ticket:', error);
  }
};

module.exports = { enviarTicketCompra };