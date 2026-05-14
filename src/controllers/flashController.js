const supabase = require('../config/supabase');

const flashController = {

  // ── Ofertas activas para el Home ─────────────────────────────
  async getOfertasActivas(req, res) {
    try {
      const { data, error } = await supabase
        .from('ofertas_flash')
        .select(`
          *,
          productos (
            id,
            nombre_producto,
            precio_normal,
            precio_oferta,
            imagenes,
            stock_disponible
          )
        `)
        .eq('activa', true);

      if (error) throw error;

      // Filtro en memoria: excluir agotadas o expiradas
      const ahora = new Date();
      const validas = data.filter(o => {
        if (o.tipo_limite === 'cantidad') {
          return parseInt(o.usos_actuales) < parseInt(o.valor_limite);
        }
        if (o.tipo_limite === 'tiempo') {
          return new Date(o.valor_limite) > ahora;
        }
        return true;
      });

      return res.json(validas);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },
};

module.exports = flashController;