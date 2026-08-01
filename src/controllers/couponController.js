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
      // 1. Buscar el cupón
      const { data: cupon, error } = await supabase
        .from('cupones')
        .select('*')
        .eq('codigo', codigo.toUpperCase())
        .single();

      if (error || !cupon) {
        return res.status(404).json({ message: 'Cupón no encontrado' });
      }

      // 2. Activo
      if (cupon.activo === false) {
        return res.status(400).json({ message: 'Este cupón no está disponible' });
      }

      // 3. Dueño (cupón personal)
      if (cupon.usuario_id && cupon.usuario_id !== usuario_id) {
        return res.status(403).json({ message: 'Este cupón es personal y no te pertenece' });
      }

      // 4. Vigencia
      const ahora = new Date();
      if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > ahora) {
        return res.status(400).json({ message: 'Este cupón aún no está vigente' });
      }
      if (cupon.fecha_exp && new Date(cupon.fecha_exp) < ahora) {
        return res.status(400).json({ message: 'Este cupón ya expiró' });
      }

      // 5. Usos globales
      if (cupon.usos_actuales >= cupon.uso_maximo) {
        return res.status(400).json({ message: 'Cupón agotado' });
      }

      // 6. Usos por usuario (contra pedidos.cupon_id)
      if (usuario_id && cupon.uso_maximo_por_usuario) {
        const { count } = await supabase
          .from('pedidos')
          .select('*', { count: 'exact', head: true })
          .eq('cupon_id', cupon.id)
          .eq('usuario_id', usuario_id);
        if ((count ?? 0) >= cupon.uso_maximo_por_usuario) {
          return res.status(400).json({ message: 'Ya usaste este cupón el máximo de veces' });
        }
      }

      // 7. Subtotal real del carrito (a partir de los ítems enviados)
      const subtotal = r2(items.reduce(
        (s, it) => s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0), 0
      ));

      // 8. Compra mínima (nunca por debajo del piso de la plataforma)
      const minima = Math.max(Number(cupon.compra_minima) || PISO_COMPRA, PISO_COMPRA);
      if (subtotal < minima) {
        return res.status(400).json({
          message: `Este cupón aplica en compras desde S/ ${minima.toFixed(2)}`
        });
      }

      // 9. Compra máxima
      if (cupon.compra_maxima && subtotal > Number(cupon.compra_maxima)) {
        return res.status(400).json({
          message: `Este cupón aplica solo en compras hasta S/ ${Number(cupon.compra_maxima).toFixed(2)}`
        });
      }

      // 10. Base del descuento (categoría exclusiva → solo ítems de esa categoría)
      let base = subtotal;
      if (cupon.categoria_id) {
        const ids = items.map(i => i.producto_id).filter(Boolean);
        const { data: prods } = await supabase
          .from('productos')
          .select('id, categoria_id')
          .in('id', ids);

        const catMap = {};
        (prods ?? []).forEach(p => { catMap[p.id] = p.categoria_id; });

        base = r2(items.reduce((s, it) => {
          return catMap[it.producto_id] === cupon.categoria_id
            ? s + (Number(it.precio) || 0) * (Number(it.cantidad) || 0)
            : s;
        }, 0));

        if (base <= 0) {
          return res.status(400).json({
            message: 'Este cupón aplica solo a productos de una categoría específica'
          });
        }
      }

      // 11. Calcular el descuento según tipo
      let descuento;
      if (cupon.tipo_descuento === 'monto_fijo') {
        descuento = Number(cupon.valor);
      } else { // porcentaje
        descuento = base * (Number(cupon.valor) / 100);
        if (cupon.descuento_maximo) {
          descuento = Math.min(descuento, Number(cupon.descuento_maximo));
        }
      }
      // El descuento nunca puede superar la base elegible
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

  // ── Lista cupones para el selector en Flutter (sin cambios) ──
  async listarCuponesDisponibles(req, res) {
    const { userId } = req.query;
    try {
      if (!userId) {
        return res.status(400).json({ error: 'Falta el userId en la consulta' });
      }

      const { data: cupones, error } = await supabase
        .from('cupones')
        .select('*')
        .or(`usuario_id.is.null,usuario_id.eq.${userId}`);

      if (error) throw error;

      const ahora = new Date();
      const disponibles = (cupones ?? []).filter(c => {
        if (c.activo === false) return false;
        const noHaExpirado = !c.fecha_exp || new Date(c.fecha_exp) > ahora;
        const yaInicio     = !c.fecha_inicio || new Date(c.fecha_inicio) <= ahora;
        const tieneStock   = c.usos_actuales < c.uso_maximo;
        return tieneStock && noHaExpirado && yaInicio;
      });

      res.status(200).json(disponibles);
    } catch (e) {
      console.error('🚨 Error en listarCuponesDisponibles:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
};

module.exports = couponController;