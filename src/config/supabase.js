const { createClient } = require('@supabase/supabase-js');
const dns = require('dns'); // <--- Agrega esto
require('dotenv').config();

// ESTA LÍNEA ES CLAVE: Fuerza a Node a usar el orden del sistema operativo
// Esto debería obligar a Node a ver el túnel de WARP
dns.setDefaultResultOrder('ipv4first'); 

const supabaseUrl = process.env.SUPABASE_URL; 
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;