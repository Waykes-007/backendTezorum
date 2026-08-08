const supabase = require('../config/supabase');

// ───────────────────────────────────────────────────────────────────────────
// GET /api/productos/:id/variantes
// Variantes (color / talla / stock) de un producto de moda. [] si no tiene.
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

// ───────────────────────────────────────────────────────────────────────────
// GET /api/productos/:id/imagenes-color
// Imágenes por color: [{ color, imagenes: [url, ...] }]. [] si no tiene.
// La ficha cambia la galería según el color que elija el cliente.
// ───────────────────────────────────────────────────────────────────────────
async function getImagenesColor(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('imagenes_color')
      .select('color, imagenes')
      .eq('producto_id', id);
    if (error) throw new Error(error.message);
    return res.json(data ?? []);
  } catch (e) {
    console.error('🚨 getImagenesColor:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

module.exports = { getVariantesProducto, getImagenesColor };