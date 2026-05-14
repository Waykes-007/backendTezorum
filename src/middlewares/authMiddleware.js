const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const authMiddleware = {
    /**
     * Verifica que el usuario esté autenticado (General para la App)
     */
    verificarToken: async (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'No hay token de autenticación' });
        }

        try {
            // Validamos con Supabase para asegurar que la sesión esté activa
            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (error || !user) {
                return res.status(401).json({ message: 'Token inválido o expirado' });
            }

            req.user = user;
            next();
        } catch (err) {
            return res.status(401).json({ message: 'Error de autenticación' });
        }
    },

    /**
     * Verifica que el usuario sea administrador (Para el Dashboard React)
     */
    soloAdmin: async (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: "No autorizado" });

        try {
            // Decodificamos el JWT usando el Secret de Supabase
            const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
            
            // Verificamos el ROL que asignamos en la DB
            // Nota: Debes asegurarte de que Supabase incluya el rol en el JWT o 
            // hacer un select rápido aquí si prefieres seguridad extrema.
            const { data: usuario } = await supabase
                .from('usuarios')
                .select('rol')
                .eq('id', decoded.sub)
                .single();

            if (!usuario || !['admin_general', 'gestor_pedidos'].includes(usuario.rol)) {
                return res.status(403).json({ error: "Acceso denegado: Permisos insuficientes" });
            }

            req.user = decoded;
            req.rol = usuario.rol; // Guardamos el rol para usarlo en los controladores
            next();
        } catch (err) {
            return res.status(401).json({ error: "Token administrativo inválido" });
        }
    }
};

module.exports = authMiddleware;