const referralService = require('../services/referralService');
const supabase = require('../config/supabase');

/**
 * PASO 1: Registro Inicial
 * Crea el usuario en Supabase Auth.
 * Esto dispara el Trigger de la DB para crear la fila en la tabla 'usuarios' con saldo 0.
 */
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email y contraseña requeridos' });
        }

        // 1. Registro en Auth
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // 2. EL SEGURO: Si el trigger falló, esto crea la fila manualmente.
        // Si el trigger funcionó, esto simplemente no hace nada (no duplica).
        await supabase.from('usuarios').upsert({
            id: data.user.id,
            correo_electronico: email,
            nombre_completo: 'Usuario Tezórum',
            saldo_disponible: 0.00
        });

        res.status(201).json({
            message: '¡Bienvenido!',
            userId: data.user.id,
            email: data.user.email
        });
    } catch (error) {
        // ESTO ES LO MÁS IMPORTANTE AHORA
        console.log("========== ERROR DE BASE DE DATOS ==========");
        console.log("Mensaje:", error.message);
        console.log("Detalles completos:", error); 
        console.log("============================================");
        
        res.status(400).json({ 
            error: 'Database error', 
            message: error.message 
        });
    }
    };
/**
 * PASO 2: Completar Registro (Lógica de Referidos)
 * Verifica si el usuario usó un código para aplicar los bonos de la Guía.
 */
exports.completarRegistro = async (req, res) => {
    try {
        const { userId, nombre_completo, codigoReferidoUsado } = req.body;

        // 1. Actualizamos el nombre (proceso normal de perfil)
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ nombre_completo })
            .eq('id', userId);

        if (updateError) throw updateError;

        // 2. DECISIÓN CLAVE: ¿Necesita pasar por el modal de celular?
        let requiereBono = false;

        if (codigoReferidoUsado && codigoReferidoUsado.trim() !== "") {
            const anfitrionId = await referralService.validarCodigo(codigoReferidoUsado);
            
            // Si el código es real y no es de él mismo, marcamos que requiere celular
            if (anfitrionId && anfitrionId !== userId) {
                requiereBono = true;
            }
        }
        
        // 3. Respondemos a Flutter indicando si debe mostrar el modal o no
        res.status(200).json({ 
            message: 'Perfil actualizado',
            requiereValidacionCelular: requiereBono 
        });

    } catch (error) {
        console.error("❌ Error en completarRegistro:", error.message);
        res.status(400).json({ error: error.message });
    }
};
/**
 * INICIO DE SESIÓN
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        res.status(200).json({
            message: 'Bienvenido a Tezórum',
            user: {
                id: data.user.id,
                email: data.user.email
            },
            session: data.session
        });
    } catch (error) {
        res.status(401).json({ 
            error: 'Credenciales inválidas', 
            message: error.message 
        });
    }
};

exports.validarCelular = async (req, res) => {
    try {
        const { userId, telefono, codigoReferidoUsado } = req.body;

        // 1. Intentamos guardar el teléfono en la tabla 'usuarios'
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ telefono: telefono })
            .eq('id', userId);

        // 2. Manejo de error de duplicado
        if (updateError) {
            if (updateError.code === '23505') { 
                return res.status(400).json({ message: 'Este celular ya está vinculado a otra cuenta de Tezórum.' });
            }
            throw updateError;
        }

        // 3. Procesamos el bono de referido
        if (codigoReferidoUsado) {
            const anfitrionId = await referralService.validarCodigo(codigoReferidoUsado);
            if (anfitrionId && anfitrionId !== userId) {
                await referralService.aplicarBonoReferido(userId, anfitrionId);
            }
        }

        res.status(200).json({ message: 'Identidad validada y bono procesado.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}; // ✅ Aquí cerraba correctamente validarCelular

// ✅ Ahora obtenerPerfil está AFUERA y Node.js sí la podrá ver
exports.obtenerPerfil = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('nombre_completo, dni_ruc, telefono, direccion_referencia, distrito')
            .eq('id', id)
            .single();

        if (error || !usuario) {
            return res.status(404).json({ message: "Perfil no encontrado" });
        }

        res.status(200).json(usuario); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};