// ══════════════════════════════════════════════════════════════
// Job: Expirar ofertas flash vencidas automáticamente
// Se ejecuta cada 30 segundos en el servidor (Railway mantiene
// el proceso vivo 24/7, así que no depende de que el admin
// tenga el panel abierto).
// ══════════════════════════════════════════════════════════════

async function expirarOfertasFlash(supabase) {
  try {
    const ahora = new Date().toISOString();

    // 0) Auto-corrección: productos marcados como flash pero SIN precio_flash
    //    válido (estado inconsistente que deja el badge pegado). Se limpian
    //    en cada ciclo como red de seguridad.
    await supabase
      .from('productos')
      .update({ es_oferta_flash: false })
      .eq('es_oferta_flash', true)
      .is('precio_flash', null);

    // 1) Ofertas por TIEMPO que ya vencieron
    const { data: expiradasPorTiempo } = await supabase
      .from('ofertas_flash')
      .select('id, producto_id')
      .eq('activa', true)
      .eq('tipo_limite', 'tiempo')
      .lt('valor_limite', ahora);

    // 2) Ofertas por CANTIDAD que ya se agotaron
    const { data: ofertasPorCantidad } = await supabase
      .from('ofertas_flash')
      .select('id, producto_id, valor_limite, usos_actuales')
      .eq('activa', true)
      .eq('tipo_limite', 'cantidad');

    const expiradasPorCantidad = (ofertasPorCantidad ?? []).filter(o => {
      const limite = parseInt(o.valor_limite) || 0;
      return o.usos_actuales >= limite;
    });

    const todasExpiradas = [...(expiradasPorTiempo ?? []), ...expiradasPorCantidad];

    if (todasExpiradas.length === 0) return { expiradas: 0 };

    const idsOfertas    = todasExpiradas.map(o => o.id);
    const idsProductos  = todasExpiradas.map(o => o.producto_id);

    // Desactivar las ofertas
    await supabase
      .from('ofertas_flash')
      .update({ activa: false })
      .in('id', idsOfertas);

    // Limpiar precio_flash Y es_oferta_flash de los productos afectados
    await supabase
      .from('productos')
      .update({ precio_flash: null, es_oferta_flash: false })
      .in('id', idsProductos);

    console.log(`[expirarOfertasFlash] ${todasExpiradas.length} oferta(s) expirada(s) y desactivada(s)`);
    return { expiradas: todasExpiradas.length };
  } catch (err) {
    console.error('[expirarOfertasFlash] Error:', err.message);
    return { error: err.message };
  }
}

function iniciarJobExpiracion(supabase, intervaloMs = 30000) {
  // Ejecutar una vez al iniciar el servidor
  expirarOfertasFlash(supabase);
  // Luego cada intervaloMs (default 30s)
  setInterval(() => expirarOfertasFlash(supabase), intervaloMs);
  console.log(`[expirarOfertasFlash] Job iniciado — revisa cada ${intervaloMs / 1000}s`);
}

module.exports = { expirarOfertasFlash, iniciarJobExpiracion };