const supabase = require('../config/supabase');

// ── Progreso del usuario según el tipo de condición ──
async function contarProgreso(tipo, userId) {
  switch (tipo) {
    case 'primera_compra_entregada':
    case 'num_compras_entregadas': {
      const { count } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('estado_pedido', 'entregado');
      return count ?? 0;
    }
    case 'num_resenas': {
      const { count } = await supabase
        .from('resenas')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', userId);
      return count ?? 0;
    }
    case 'giros_ruleta': {
      // Cada giro deja una fila en recompensas_diarias (1 por día)
      const { count } = await supabase
        .from('recompensas_diarias')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', userId);
      return count ?? 0;
    }
    default:
      return 0;
  }
}

const recompensasController = {

  // ── GET /recompensas/:userId — lista con progreso y estado ──
  async obtenerRecompensas(req, res) {
    const { userId } = req.params;
    try {
      const { data: recompensas } = await supabase
        .from('recompensas')
        .select('*')
        .eq('activo', true)
        .order('fecha_creacion', { ascending: true });

      const { data: reclamadas } = await supabase
        .from('recompensas_usuario')
        .select('recompensa_id, fecha_reclamo')
        .eq('usuario_id', userId);

      const mapaReclamadas = {};
      (reclamadas ?? []).forEach(r => { mapaReclamadas[r.recompensa_id] = r; });

      const resultado = [];
      for (const rec of (recompensas ?? [])) {
        const progreso = await contarProgreso(rec.tipo_condicion, userId);
        const reclamo  = mapaReclamadas[rec.id];

        let estado = 'bloqueada';
        if (reclamo)                 estado = 'reclamada';
        else if (progreso >= rec.meta) estado = 'disponible';

        resultado.push({
          ...rec,
          progreso:      Math.min(progreso, rec.meta),
          progreso_real: progreso,
          estado,
          fecha_reclamo: reclamo?.fecha_reclamo ?? null,
        });
      }

      return res.json(resultado);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── POST /recompensas/:userId/reclamar — verifica y acuña el cupón ──
  async reclamarRecompensa(req, res) {
    const { userId } = req.params;
    const { recompensa_id } = req.body;
    if (!recompensa_id) return res.status(400).json({ message: 'Falta recompensa_id' });

    try {
      // 1. Recompensa activa
      const { data: rec } = await supabase
        .from('recompensas').select('*').eq('id', recompensa_id).single();
      if (!rec || rec.activo === false) {
        return res.status(404).json({ message: 'Recompensa no disponible' });
      }

      // 2. ¿Ya reclamada?
      const { data: ya } = await supabase
        .from('recompensas_usuario')
        .select('id')
        .eq('usuario_id', userId)
        .eq('recompensa_id', recompensa_id)
        .maybeSingle();
      if (ya) return res.status(400).json({ message: 'Ya reclamaste esta recompensa' });

      // 3. Re-verificar la condición en el servidor (nunca confiar en el cliente)
      const progreso = await contarProgreso(rec.tipo_condicion, userId);
      if (progreso < rec.meta) {
        return res.status(403).json({ message: 'Aún no cumples la condición de esta recompensa' });
      }

      // 4. Acuñar el cupón personal
      const sufijo = Math.random().toString(36).slice(2, 7).toUpperCase();
      const codigo = `${(rec.codigo || 'PREMIO').toUpperCase().slice(0, 10)}-${sufijo}`;
      const fechaExp = new Date();
      fechaExp.setDate(fechaExp.getDate() + (rec.premio_vigencia_dias ?? 30));

      const { data: cupon, error: errCupon } = await supabase
        .from('cupones')
        .insert([{
          codigo,
          descripcion:            `Recompensa: ${rec.titulo}`,
          tipo_descuento:         rec.premio_tipo_descuento,
          valor:                  rec.premio_valor,
          porcentaje:             rec.premio_tipo_descuento === 'porcentaje' ? rec.premio_valor : null,
          descuento_maximo:       rec.premio_descuento_maximo ?? null,
          compra_minima:          rec.premio_compra_minima ?? 49.90,
          compra_maxima:          rec.premio_compra_maxima ?? null,
          categoria_id:           rec.premio_categoria_id ?? null,
          fecha_exp:              fechaExp.toISOString(),
          uso_maximo:             1,
          usos_actuales:          0,
          uso_maximo_por_usuario: 1,
          usuario_id:             userId,   // cupón personal
          activo:                 true,
          origen:                 'recompensa',
        }])
        .select().single();

      if (errCupon) return res.status(500).json({ error: errCupon.message });

      // 5. Registrar el reclamo (el unique impide doble reclamo)
      const { error: errReclamo } = await supabase
        .from('recompensas_usuario')
        .insert([{ usuario_id: userId, recompensa_id, cupon_id: cupon.id }]);

      if (errReclamo) {
        // Doble clic / carrera → limpiamos el cupón para no dejar basura
        await supabase.from('cupones').delete().eq('id', cupon.id);
        return res.status(400).json({ message: 'Ya reclamaste esta recompensa' });
      }

      return res.status(201).json({
        message: '¡Recompensa reclamada! Tu cupón está en "Mis cupones".',
        codigo:  cupon.codigo,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
};

module.exports = recompensasController;