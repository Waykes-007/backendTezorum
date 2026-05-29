router.get('/izipay/pagar-yape/:tokenId', (req, res) => {
  const { tokenId } = req.params;
  const formToken = tokensTemporales.get(tokenId);

  if (!formToken) {
    return res.send(`
      <html><body style="text-align:center;font-family:Arial;padding:40px;">
        <h1 style="color:red;">⏱️ Token expirado</h1>
        <p>Vuelve a la app e intenta de nuevo.</p>
      </body></html>
    `);
  }

  const publicKey = process.env.IZIPAY_PUBLIC_KEY_TEST;

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta charset="UTF-8" />
  <script type="text/javascript"
    src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js"
    kr-public-key="${publicKey}"
    kr-language="es-PE"
    kr-post-url-success="https://backendtezorum.onrender.com/api/izipay/exito"
    kr-post-url-refused="https://backendtezorum.onrender.com/api/izipay/error">
  </script>
  <link rel="stylesheet" href="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/neon-reset.min.css">
  <script type="text/javascript" src="https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/neon.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: linear-gradient(135deg, #6B21A8, #9333EA); min-height: 100vh; }
    .header { text-align: center; padding: 30px 20px 20px; }
    .header h2 { color: white; font-size: 22px; margin: 0; font-weight: 900; }
    .header p { color: rgba(255,255,255,0.8); font-size: 13px; margin: 4px 0 0; }
    .container { background: white; border-radius: 24px 24px 0 0; padding: 24px; min-height: calc(100vh - 120px); }
    .yape-badge { display:flex; align-items:center; justify-content:center; gap:8px; background:#6C1AAB; border-radius:12px; padding:12px; margin-bottom:20px; }
    .yape-badge span { color:white; font-size:14px; font-weight:bold; }
    .kr-payment-button { background: #6C1AAB !important; border-radius: 14px !important; width: 100% !important; height: 52px !important; font-size: 16px !important; font-weight: bold !important; margin-top: 16px !important; }
    .kr-field-wrapper { border-radius: 12px !important; border: 1.5px solid #e5e7eb !important; margin-bottom: 12px !important; }
    .kr-field-wrapper:focus-within { border-color: #6C1AAB !important; }
  </style>
</head>
<body>
  <div class="header">
    <h2>💜 Pagar con Yape</h2>
    <p>Tezórum • Powered by Izipay</p>
  </div>
  <div class="container">
    <div class="yape-badge">
      <span>📱 Abre Yape → Más → Código Yape → copia el código OTP</span>
    </div>
        <div class="kr-embedded" kr-form-token="${formToken}">
      <button class="kr-payment-button"></button>
    </div>
  </div>
</body>
</html>
  `);
});