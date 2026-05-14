const supabase = require('../config/supabase');

const couponController = {
    
    // Mantiene la validación individual por código
    // En couponController.js
    async validarCupon(req, res) {
        const { codigo, usuario_id } = req.body; // 👈 Ahora recibimos quién intenta usarlo

        try {
            const { data: cupon, error } = await supabase
                .from('cupones')
                .select('*')
                .eq('codigo', codigo.toUpperCase())
                .single();

            if (error || !cupon) {
                return res.status(404).json({ message: "Cupón no encontrado" });
            }

            // --- 🛡️ FILTRO DE SEGURIDAD CRÍTICO ---
            // Si el cupón tiene un dueño asignado y no es el usuario actual, bloqueamos
            if (cupon.usuario_id && cupon.usuario_id !== usuario_id) {
                return res.status(403).json({ message: "Este cupón es personal y no te pertenece" });
            }
            // --------------------------------------

            if (cupon.fecha_exp && new Date(cupon.fecha_exp) < new Date()) {
                return res.status(400).json({ message: "Este cupón ya expiró" });
            }

            if (cupon.usos_actuales >= cupon.uso_maximo) {
                return res.status(400).json({ message: "Cupón agotado" });
            }

            res.status(200).json({
                message: "¡Cupón aplicado!",
                descuento: cupon.porcentaje
            });

        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    },

    // NUEVA FUNCIÓN: Lista cupones para el selector en Flutter
        // En couponController.js
        async listarCuponesDisponibles(req, res) {
        const { userId } = req.query;

        try {
            if (!userId) {
                return res.status(400).json({ error: "Falta el userId en la consulta" });
            }

            const { data: cupones, error } = await supabase
                .from('cupones')
                .select('*')
                // Filtro dinámico: Trae cupones generales o asignados a este usuario
                .or(`usuario_id.is.null,usuario_id.eq.${userId}`);

            if (error) throw error;

            const ahora = new Date();

            // Filtramos por fecha y stock
            const disponibles = cupones.filter(c => {
                const fechaExp = new Date(c.fecha_exp);
                const tieneStock = c.usos_actuales < c.uso_maximo;
                const noHaExpirado = fechaExp > ahora;
                return tieneStock && noHaExpirado;
            });

            res.status(200).json(disponibles);
        } catch (e) {
            console.error("🚨 Error en listarCuponesDisponibles:", e.message);
            res.status(500).json({ error: e.message });
        }
    }
};

module.exports = couponController;