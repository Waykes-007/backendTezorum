const supabase = require('../config/supabase');
const walletService = require('../services/walletService'); // Importamos el servicio

const walletController = {
    
    // Función para obtener saldo e historial (Módulo 3.5)
    async obtenerEstadoBilletera(req, res) {
        const { userId } = req.params;
        try {
            // Llamamos a la lógica que ya tienes en el servicio
            const datos = await walletService.consultarDatosBilletera(userId);
            res.status(200).json(datos);
        } catch (error) {
            console.error("Error obteniendo billetera:", error.message);
            res.status(500).json({ error: error.message });
        }
    },

    // Función para la ruleta (Módulo 3.7)
    // En src/controllers/walletController.js
        async reclamarPremioDiario(req, res) {
        const { usuario_id, monto } = req.body;

        try {
            // 1. Intentar insertar en la tabla de recompensas diarias
            // Si ya existe un registro para hoy, Supabase dará error por el UNIQUE CONSTRAINT
            const { error: errDiario } = await supabase
                .from('recompensas_diarias')
                .insert([{
                    usuario_id,
                    premio_otorgado: 'Giro de Ruleta 🎡',
                    valor_premio: monto,
                    fecha_reclamado: new Date().toISOString().split('T')[0] // Formato YYYY-MM-DD
                }]);

            if (errDiario) {
                if (errDiario.code === '23505') { // Código de error para duplicados (Unique violation)
                    return res.status(403).json({ 
                        error: "Ya reclamaste tu premio de hoy. ¡Vuelve mañana!" 
                    });
                }
                throw errDiario;
            }

            // 2. Si se guardó la recompensa, actualizamos el saldo e historial
            const resultado = await walletService.modificarSaldo(
                usuario_id, 
                monto, 
                'ingreso', 
                'Premio de la Ruleta Tezórum 🎡'
            );

            res.status(200).json(resultado);

        } catch (error) {
            console.error("Error en ruleta:", error.message);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = walletController;