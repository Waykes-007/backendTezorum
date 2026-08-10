const supabase = require('../config/supabase');

// Vigencia por defecto de las recompensas de saldo (ruleta): 7 días.
const VIGENCIA_DIAS_DEFECTO = 7;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const walletService = {

  // ── Saldo VIGENTE = suma de recompensas no usadas y no vencidas ──
  // (Opción B: el saldo real vive en recompensas_saldo, no en un
  //  número fijo, para que cada recompensa pueda vencer por separado)
  async saldoVigente(usuarioId) {
    const { data, error } = await supabase
      .from('recompensas_saldo')
      .select('monto')
      .eq('usuario_id', usuarioId)
      .eq('usado', false)
      .gt('vence_en', new Date().toISOString());
    if (error) throw error;
    return r2((data ?? []).reduce((s, x) => s + parseFloat(x.monto || 0), 0));
  },

  // ── Acreditar saldo: crea UNA recompensa con su vencimiento propio ──
  // Cada acreditación es su propia fila → vence de forma independiente.
  async acreditarSaldo(usuarioId, monto, descripcion, opciones = {}) {
    const { vigenciaDias = VIGENCIA_DIAS_DEFECTO, origen = 'ruleta' } = opciones;
    const m = parseFloat(monto);
    if (!(m > 0)) {
      return { success: true, nuevoSaldo: await this.saldoVigente(usuarioId) };
    }

    const ahora = new Date();
    const vence = new Date(ahora.getTime() + vigenciaDias * 24 * 60 * 60 * 1000);

    const [resLibro, resHist] = await Promise.all([
      supabase.from('recompensas_saldo').insert([{
        usuario_id:  usuarioId,
        monto:       m,
        obtenido_en: ahora.toISOString(),
        vence_en:    vence.toISOString(),
        usado:       false,
        origen,
      }]),
      supabase.from('historial_billetera').insert([{
        usuario_id:      usuarioId,
        monto:           m,
        tipo_movimiento: 'ingreso',
        descripcion,
      }]),
    ]);
    if (resLibro.error) throw resLibro.error;
    if (resHist.error)  throw resHist.error;

    return { success: true, nuevoSaldo: await this.saldoVigente(usuarioId) };
  },

  // ── Gastar saldo: consume primero las recompensas que VENCEN ANTES ──
  // (FIFO por vencimiento; soporta consumo parcial de una recompensa).
  // NOTA: listo para el checkout de fase 2 — aún no se llama desde
  // ningún pedido.
  async gastarSaldo(usuarioId, monto, pedidoId = null) {
    const objetivo = parseFloat(monto);
    if (!(objetivo > 0)) {
      return { success: true, gastado: 0, nuevoSaldo: await this.saldoVigente(usuarioId) };
    }

    const { data: vivos, error } = await supabase
      .from('recompensas_saldo')
      .select('id, monto')
      .eq('usuario_id', usuarioId)
      .eq('usado', false)
      .gt('vence_en', new Date().toISOString())
      .order('vence_en', { ascending: true });
    if (error) throw error;

    const disponible = (vivos ?? []).reduce((s, x) => s + parseFloat(x.monto || 0), 0);
    if (disponible + 1e-9 < objetivo) throw new Error('Saldo insuficiente');

    let restante = objetivo;
    for (const fila of (vivos ?? [])) {
      if (restante <= 1e-9) break;
      const saldoFila = parseFloat(fila.monto || 0);
      if (saldoFila <= restante + 1e-9) {
        // Se consume entera
        const { error: e1 } = await supabase.from('recompensas_saldo')
          .update({ monto: 0, usado: true, pedido_id: pedidoId })
          .eq('id', fila.id);
        if (e1) throw e1;
        restante = r2(restante - saldoFila);
      } else {
        // Consumo parcial → queda remanente en la fila
        const { error: e2 } = await supabase.from('recompensas_saldo')
          .update({ monto: r2(saldoFila - restante) })
          .eq('id', fila.id);
        if (e2) throw e2;
        restante = 0;
      }
    }

    const { error: eHist } = await supabase.from('historial_billetera').insert([{
      usuario_id:      usuarioId,
      monto:           objetivo,
      tipo_movimiento: 'egreso',
      descripcion:     'Saldo usado en un pedido',
    }]);
    if (eHist) throw eHist;

    return { success: true, gastado: objetivo, nuevoSaldo: await this.saldoVigente(usuarioId) };
  },

  // ── Compatibilidad: conserva la firma vieja modificarSaldo(...) ──
  // 'ingreso' → acreditar (con vencimiento); 'egreso' → gastar (FIFO).
  async modificarSaldo(usuarioId, monto, tipoMovimiento, descripcion) {
    if (tipoMovimiento === 'ingreso') {
      return this.acreditarSaldo(usuarioId, monto, descripcion);
    }
    return this.gastarSaldo(usuarioId, monto);
  },

  // ── Datos de la billetera para la app ──
  // saldo = vigente (calculado); historial = movimientos (bitácora);
  // proximo_vencimiento = la recompensa viva que vence antes.
  async consultarDatosBilletera(userId) {
    const { data: existe } = await supabase
      .from('usuarios').select('id').eq('id', userId).maybeSingle();
    if (!existe) {
      return { saldo: 0.00, historial: [], proximo_vencimiento: null };
    }

    const [saldo, hist, prox] = await Promise.all([
      this.saldoVigente(userId),
      supabase.from('historial_billetera')
        .select('*')
        .eq('usuario_id', userId)
        .order('fecha', { ascending: false })
        .limit(30),
      supabase.from('recompensas_saldo')
        .select('monto, vence_en')
        .eq('usuario_id', userId)
        .eq('usado', false)
        .gt('vence_en', new Date().toISOString())
        .order('vence_en', { ascending: true })
        .limit(1),
    ]);

    const proxima = (prox.data ?? [])[0] ?? null;
    return {
      saldo,
      historial: hist.data ?? [],
      proximo_vencimiento: proxima ? proxima.vence_en : null,
    };
  },
};

module.exports = walletService;