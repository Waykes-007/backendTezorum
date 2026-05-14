const supabase = require('../config/supabase');
const walletService = require('./walletService');

const referralService = {
    /**
     * Valida un código de referido con limpieza de espacios y case-insensitive.
     */
    async validarCodigo(codigo) {
        const codigoLimpio = codigo.trim().toUpperCase();

        const { data, error } = await supabase
            .from('usuarios')
            .select('id')
            .ilike('codigo_referido_propio', `%${codigoLimpio}%`)
            .maybeSingle();

        if (error) return null;
        return data ? data.id : null;
    },

    /**
     * Aplica recompensas basadas en escalas: 1->S/1, 3->S/5, 5->Producto Gratis.
     */
    async aplicarBonoReferido(invitadoId, anfitrionId) {
        try {
            console.log(`Iniciando lógica de escalas: Invitado ${invitadoId} -> Anfitrión ${anfitrionId}`);

            // 1. SEGURIDAD: Evitar auto-referido
            if (invitadoId === anfitrionId) {
                console.log("⚠️ Intento de auto-referido detectado. Operación cancelada.");
                return;
            }

            // 2. SEGURIDAD: Verificar si el invitado YA fue referido antes por alguien
            const { data: yaReferido } = await supabase
                .from('registro_referidos')
                .select('id')
                .eq('invitado_id', invitadoId)
                .maybeSingle();

            if (yaReferido) {
                console.log("⚠️ Este invitado ya premió a alguien anteriormente. No se genera nuevo bono.");
                return;
            }

            // 3. REGISTRO PREVIO: Insertamos al invitado primero para que el conteo sea exacto
            const { error: insertError } = await supabase
                .from('registro_referidos')
                .insert([{
                    anfitrion_id: anfitrionId,
                    invitado_id: invitadoId,
                    recompensa_aplicada: true
                }]);

            if (insertError) throw insertError;

            // 4. CONTEO REAL: Contamos cuántos registros hay ahora (incluyendo el actual)
            const { count, error: countError } = await supabase
                .from('registro_referidos')
                .select('*', { count: 'exact', head: true })
                .eq('anfitrion_id', anfitrionId)
                .eq('recompensa_aplicada', true);

            if (countError) throw countError;

            const numeroReferido = count; // Ya no sumamos +1 porque ya se insertó arriba
            let montoBono = 0;
            let mensajeHistorial = "";
            let otorgaProductoGratis = false;

            // 5. LÓGICA DE ESCALAS MEJORADA
            if (numeroReferido === 1) {
                montoBono = 1.00;
                mensajeHistorial = "Bono 1er Referido alcanzado (S/ 1.00)";
            } else if (numeroReferido === 3) {
                montoBono = 5.00;
                mensajeHistorial = "Bono 3er Referido alcanzado (S/ 5.00)";
            } else if (numeroReferido === 5) {
                montoBono = 0.00;
                otorgaProductoGratis = true;
                mensajeHistorial = "¡RECOMPENSA MÁXIMA: 5 Referidos! (Producto Gratis)";
            } else {
                // Referidos 2, 4 o más de 5
                montoBono = 0.00;
                mensajeHistorial = `Referido #${numeroReferido} registrado (Sin bono intermedio)`;
            }

            // 6. VINCULACIÓN EN PERFIL: Para que aparezca en la columna id_referido_por
            await supabase
                .from('usuarios')
                .update({ id_referido_por: anfitrionId })
                .eq('id', invitadoId);

            // 7. EJECUCIÓN DE PAGO (Solo si montoBono > 0)
            if (montoBono > 0) {
                await walletService.modificarSaldo(
                    anfitrionId, 
                    montoBono, 
                    'ingreso', 
                    mensajeHistorial
                );
            }

            // 8. ENTREGA DE PREMIO FÍSICO (Si aplica)
            if (otorgaProductoGratis) {
                await supabase
                    .from('usuarios')
                    .update({ tiene_producto_gratis: true })
                    .eq('id', anfitrionId);
            }
            
            console.log(`✅ Proceso completado exitosamente para el referido #${numeroReferido}.`);

        } catch (err) {
            console.error("❌ Error crítico en aplicarBonoReferido:", err.message);
            throw err;
        }
    }
};

module.exports = referralService;