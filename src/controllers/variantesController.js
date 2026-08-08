const supabase = require('../config/supabase');

// ───────────────────────────────────────────────────────────────────────────
// GET /api/productos/:id/variantes
// Devuelve las variantes (color / talla / stock) de un producto de moda.
// La app la llama solo para mostrar los selectores; si el producto no tiene
// variantes, responde [] y la ficha se comporta como un producto normal.
// ───────────────────────────────────────────────────────────────────────────
async function getVariantesProducto(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('variantes_producto')
      .select('color, talla, stock')
      .eq('producto_id', id)
      .order('color', { ascending: true })
      .order('talla', { ascending: true });
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
  } catch (e) {
    console.error('🚨 getVariantesProducto:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

module.exports = { getVariantesProducto };