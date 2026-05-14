// ==============================================
// 1. CONFIGURACIÓN DE RED Y DNS (CRÍTICO)
// ==============================================
const dns = require('dns');

// Forzamos a Node a usar los servidores de Google para evitar el error ENOTFOUND
dns.setServers(['8.8.8.8', '8.8.4.4']); 

const { lookup } = dns;
dns.lookup = (hostname, options, callback) => {
    // Si la dirección es de Supabase, forzamos la búsqueda externa
    if (hostname.includes('supabase.co')) {
        return lookup(hostname, { ...options, family: 4 }, callback);
    }
    return lookup(hostname, options, callback);
};

// Priorizamos IPv4 para acelerar la respuesta de la base de datos
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// ==============================================
// 2. CARGA DE VARIABLES Y APLICACIÓN
// ==============================================
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

// ==============================================
// 3. INICIO DEL SERVIDOR
// ==============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('==============================================');
    console.log(`🚀 TEZÓRUM BACKEND INICIADO`);
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(`📱 Red: http://TU_IP_LOCAL:${PORT}`);
    console.log('==============================================');
});