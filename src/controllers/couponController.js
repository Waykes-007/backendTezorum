const supabase = require('../config/supabase');

const PISO_COMPRA = 49.90;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const couponController = {

  // ── Valida un cupón CONTRA EL CARRITO y devuelve el monto exacto ──
  // body: { codigo, usuario_id, items: [{ producto_id, precio, cantidad }] }
  async validarCupon(req, res) {
    const { codigo, usuario_id, items } = req.body;

    if (!codigo) return res.status(400).json({ message: 'Falta el código del cupón' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'El carrito está vacío' });
    }

    try {
      const { data: cupon, error } = await supabase
        .from('cupones').select('*')
        .eq('codigo', codigo.toUpperCase()).single();

      if (error || !cupon) return res.status(404).json({ message: 'Cupón no encontrado' });

      if (cupon.activo === false) {
        return res.status(400).json({ message: 'Este cupón no está disponible' });
      }
      if (cupon.usuario_id && cupon.usuario_id !== usuario_id) {
        return res.status(403).json({ message: 'Este cupón es personal y no te pertenece' });
      }

      const ahora = new Date();
      if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > ahora) {
        return res.status(400).json({ message: 'Este cupón aún no está vigente' });
      }
      if (cupon.fecha_exp && new Date(cupon.fecha_exp) < ahora) {
        return res.status(400).json({ message: 'Este cupón ya expiró' });
      }
      if (cupon.usos_actuales >= cupon.uso_maximo) {
        return res.status(400).json({ message: 'Cupón agotado' });
      }

      // Usos por usuario
      if (usuario_id && cupon.uso_maximo_por_usuario) {
        const { count } = await supabase
          .from('pedidos').select('*', { count: 'exact', head: true })
          .eq('cupon_id', cupon.id).eq('usuario_id', usuario_id);
        if ((count ?? 0) >= cupon.uso_maximo_por_usuario) {
          return res.status(400).json({ message: 'Ya usaste este cupón el máximo de veces' });
        }
      }

      // Subtotal real del carrito
      const subtotal = r2(items.reduce(
        (s, it) => s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0), 0
      ));

      const minima = Math.max(Number(cupon.compra_minima) || PISO_COMPRA, PISO_COMPRA);
      if (subtotal < minima) {
        return res.status(400).json({
          message: `Este cupón aplica en compras desde S/ ${minima.toFixed(2)}`
        });
      }
      if (cupon.compra_maxima && subtotal > Number(cupon.compra_maxima)) {
        return res.status(400).json({
          message: `Este cupón aplica solo en compras hasta S/ ${Number(cupon.compra_maxima).toFixed(2)}`
        });
      }

      // Base del descuento (categoría exclusiva)
      let base = subtotal;
      if (cupon.categoria_id) {
        const ids = items.map(i => i.producto_id).filter(Boolean);
        const { data: prods } = await supabase
          .from('productos').select('id, categoria_id').in('id', ids);
        const catMap = {};
        (prods ?? []).forEach(p => { catMap[p.id] = p.categoria_id; });
        base = r2(items.reduce((s, it) => (
          catMap[it.producto_id] === cupon.categoria_id
            ? s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0)
            : s
        ), 0));
        if (base <= 0) {
          return res.status(400).json({
            message: 'Este cupón aplica solo a productos de una categoría específica'
          });
        }
      }

      // Descuento según tipo
      let descuento;
      if (cupon.tipo_descuento === 'monto_fijo') {
        descuento = Number(cupon.valor);
      } else {
        descuento = base * (Number(cupon.valor) / 100);
        if (cupon.descuento_maximo) descuento = Math.min(descuento, Number(cupon.descuento_maximo));
      }
      descuento = r2(Math.min(descuento, base));

      return res.status(200).json({
        message:         '¡Cupón aplicado!',
        codigo:          cupon.codigo,
        tipo_descuento:  cupon.tipo_descuento,
        valor:           Number(cupon.valor),
        descuento_monto: descuento,
        subtotal,
        categoria_id:    cupon.categoria_id ?? null,
      });

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },

  // ── Lista cupones DISPONIBLES para el usuario ──
  // Excluye: inactivos, expirados, no vigentes, agotados (global) y
  // los que el usuario YA agotó según su límite por usuario.
  async listarCuponesDisponibles(req, res) {
    const { userId } = req.query;
    try {
      if (!userId) return res.status(400).json({ error: 'Falta el userId en la consulta' });

      const { data: cupones, error } = await supabase
        .from('cupones').select('*')
        .or(`usuario_id.is.null,usuario_id.eq.${userId}`);
      if (error) throw error;

      // Cuántas veces usó el usuario cada cupón (pedidos.cupon_id)
      const { data: usos } = await supabase
        .from('pedidos').select('cupon_id')
        .eq('usuario_id', userId)
        .not('cupon_id', 'is', null);

      const usosPorCupon = {};
      (usos ?? []).forEach(p => {
        usosPorCupon[p.cupon_id] = (usosPorCupon[p.cupon_id] ?? 0) + 1;
      });

      const ahora = new Date();
      const disponibles = (cupones ?? []).filter(c => {
        if (c.activo === false) return false;
        const noHaExpirado = !c.fecha_exp    || new Date(c.fecha_exp)    > ahora;
        const yaInicio     = !c.fecha_inicio || new Date(c.fecha_inicio) <= ahora;
        const tieneStock   = c.usos_actuales < c.uso_maximo;
        const usadosUsuario = usosPorCupon[c.id] ?? 0;
        const dentroLimiteUsuario =
          !c.uso_maximo_por_usuario || usadosUsuario < c.uso_maximo_por_usuario;
        return tieneStock && noHaExpirado && yaInicio && dentroLimiteUsuario;
      });

      res.status(200).json(disponibles);
    } catch (e) {
      console.error('🚨 Error en listarCuponesDisponibles:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
};

module.exports = couponController;