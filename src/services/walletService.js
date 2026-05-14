const supabase = require('../config/supabase');

const walletService = {
    // Lógica para modificar el saldo (RECOMPENSAS / PAGOS)
        async modificarSaldo(usuarioId, monto, tipoMovimiento, descripcion) {
        const { data: usuario, error: errorUsuario } = await supabase
            .from('usuarios')
            .select('saldo_disponible')
            .eq('id', usuarioId)
            .maybeSingle(); // ✅ Seguridad extra

        if (errorUsuario || !usuario) throw new Error("Usuario no encontrado en la tabla de perfiles");

        // ✅ Aseguramos que la operación matemática sea limpia
        const saldoActual = parseFloat(usuario.saldo_disponible || 0);
        const montoOperacion = parseFloat(monto);
        const nuevoSaldo = tipoMovimiento === 'ingreso' 
            ? saldoActual + montoOperacion 
            : saldoActual - montoOperacion;

        const [resUpdate, resHistorial] = await Promise.all([
            supabase.from('usuarios').update({ saldo_disponible: nuevoSaldo }).eq('id', usuarioId),
            supabase.from('historial_billetera').insert([{
                usuario_id: usuarioId,
                monto: montoOperacion,
                tipo_movimiento: tipoMovimiento,
                descripcion: descripcion
            }])
        ]);

        if (resUpdate.error) throw resUpdate.error;
        if (resHistorial.error) throw resHistorial.error;

        return { success: true, nuevoSaldo };
    },

    // 🚀 Lógica para obtener los datos (HISTORIAL / SALDO)
    // En walletService.js
    // En src/services/walletService.js
    async consultarDatosBilletera(userId) {
        const [resUsuario, resHistorial] = await Promise.all([
            // ✅ Usamos maybeSingle() para manejar el caso de usuario no encontrado
            supabase.from('usuarios').select('saldo_disponible').eq('id', userId).maybeSingle(),
            supabase.from('historial_billetera')
                .select('*')
                .eq('usuario_id', userId)
                .order('fecha', { ascending: false })
                .limit(30) 
        ]);

        // Si no existe el usuario todavía, devolvemos valores por defecto en lugar de tirar error
        if (!resUsuario.data) {
            return { 
                saldo: 0.00, 
                historial: [] 
            };
        }

        return { 
            saldo: resUsuario.data.saldo_disponible, 
            historial: resHistorial.data || [] 
        };
    }
};

module.exports = walletService;