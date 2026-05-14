const supabase = require('../config/supabase');

exports.obtenerResenas = async (req, res) => {
  const { productoId } = req.params;
  const { data, error } = await supabase
    .from('resenas')
    .select('*, usuarios(nombre_completo)')
    .eq('producto_id', productoId)
    .order('fecha_creacion', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
};

exports.crearResena = async (req, res) => {
  const { producto_id, usuario_id, calificacion, comentario, imagenes } = req.body;
  if (!producto_id || !usuario_id || !calificacion) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const { data: pedido } = await supabase
    .from('detalle_pedidos')
    .select('pedido_id, pedidos!inner(usuario_id, estado_pedido)')
    .eq('producto_id', producto_id)
    .eq('pedidos.usuario_id', usuario_id)
    .eq('pedidos.estado_pedido', 'entregado')
    .limit(1);

  if (!pedido || pedido.length === 0) {
    return res.status(403).json({
      error: 'Solo puedes reseñar productos que hayas comprado y recibido.'
    });
  }

  const { error } = await supabase.from('resenas').insert([{
    producto_id,
    usuario_id,
    calificacion,
    comentario,
    imagenes: imagenes ?? [], // ← array de URLs
  }]);

  if (error) {
    if (error.code === '23505')
      return res.status(400).json({ error: 'Ya enviaste una reseña para este producto.' });
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ message: 'Reseña publicada ✅' });
};

// ← AQUÍ, fuera de crearResena
exports.eliminarResena = async (req, res) => {
  const { productoId, userId } = req.params;
  const { error } = await supabase
    .from('resenas')
    .delete()
    .eq('producto_id', productoId)
    .eq('usuario_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: 'Reseña eliminada ✅' });
};