const supabase = require('../config/supabase');

const favoritosController = {

  // Obtener IDs de favoritos del usuario
  async obtener(req, res) {
    const { userId } = req.params;
    try {
      const { data, error } = await supabase
        .from('favoritos')
        .select('producto_id')
        .eq('usuario_id', userId);

      if (error) throw error;
      return res.json((data ?? []).map(f => f.producto_id));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // Agregar favorito (ignora si ya existe)
  async agregar(req, res) {
    const { usuario_id, producto_id } = req.body;
    console.log('📌 Agregar favorito:', { usuario_id, producto_id });
    try {
        const { data, error } = await supabase
        .from('favoritos')
        .upsert({ usuario_id, producto_id },
            { onConflict: 'usuario_id, producto_id' });

        console.log('📌 Resultado:', { data, error }); // ← agregar esto
        if (error) throw error;
        return res.status(201).json({ ok: true });
    } catch (e) {
        console.error('❌ Error favorito:', e.message);
        return res.status(500).json({ error: e.message });
    }
    },

  // Eliminar favorito
  async eliminar(req, res) {
    const { userId, productoId } = req.params;
    try {
      const { error } = await supabase
        .from('favoritos')
        .delete()
        .eq('usuario_id', userId)
        .eq('producto_id', productoId);

      if (error) throw error;
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
};

module.exports = favoritosController;