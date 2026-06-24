// ==============================================
// 1. CONFIGURACIÓN DE RED Y DNS (CRÍTICO)
// ==============================================
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);

const { lookup } = dns;
dns.lookup = (hostname, options, callback) => {
    if (hostname.includes('supabase.co')) {
        return lookup(hostname, { ...options, family: 4 }, callback);
    }
    return lookup(hostname, options, callback);
};

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// ==============================================
// 2. CARGA DE VARIABLES Y APLICACIÓN
// ==============================================
require('dotenv').config();
const app = require('./src/app');

// ==============================================
// 3. INICIAR CRON DE PLANES
// ==============================================
const { iniciarPlanCron } = require('./src/jobs/planCron');
iniciarPlanCron();

const PORT = process.env.PORT || 3000;

// ==============================================
// 4. INICIO DEL SERVIDOR
// ==============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('==============================================');
    console.log(`🚀 WAYKES BACKEND INICIADO`);
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log('==============================================');
});