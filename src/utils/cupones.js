const supabase = require('../config/supabase');

const PISO_COMPRA = 49.90;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Mapa de ofertas flash activas para los productos del carrito ──
async function obtenerMapaOfertas(itemsCarrito) {
  const mapa = {};
  const ids = itemsCarrito.map(i => i.producto_id).filter(Boolean);
  if (ids.length === 0) return mapa;

  const { data: ofertas } = await supabase
    .from('ofertas_flash')
    .select('id, activa, tipo_limite, valor_limite, usos_actuales, precio_oferta, producto_id')
    .eq('activa', true)
    .in('producto_id', ids);

  const ahora = new Date();
  for (const o of (ofertas ?? [])) {
    if (o.tipo_limite === 'tiempo' && new Date(o.valor_limite) < ahora) continue;
    if (o.tipo_limite === 'cantidad' &&
        parseInt(o.usos_actuales) >= parseInt(o.valor_limite)) continue;
    mapa[o.producto_id] = o;
  }
  return mapa;
}

// Precio efectivo de un ítem: flash > oferta > normal
function precioItem(item, mapaOfertas) {
  const oferta = mapaOfertas[item.producto_id];
  return oferta
    ? parseFloat(oferta.precio_oferta)
    : parseFloat(item.productos?.precio_oferta || item.productos?.precio_normal || 0);
}

function calcularSubtotal(itemsCarrito, mapaOfertas) {
  return r2(itemsCarrito.reduce(
    (s, it) => s + precioItem(it, mapaOfertas) * parseInt(it.cantidad), 0
  ));
}

// ── Descuento del cupón validando TODAS las condiciones contra el servidor ──
// Devuelve { descuento, cuponId }. descuento = 0 si el cupón no aplica.
async function calcularDescuentoCupon({ codigo, usuario_id, itemsCarrito, mapaOfertas, subtotal }) {
  if (!codigo) return { descuento: 0, cuponId: null };

  const { data: cupon } = await supabase
    .from('cupones').select('*')
    .eq('codigo', codigo.trim().toUpperCase()).single();
  if (!cupon) return { descuento: 0, cuponId: null };

  const ahora = new Date();
  if (cupon.activo === false) return { descuento: 0, cuponId: null };
  if (cupon.usuario_id && cupon.usuario_id !== usuario_id) return { descuento: 0, cuponId: null };
  if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > ahora) return { descuento: 0, cuponId: null };
  if (cupon.fecha_exp && new Date(cupon.fecha_exp) < ahora) return { descuento: 0, cuponId: null };
  if (cupon.usos_actuales >= cupon.uso_maximo) return { descuento: 0, cuponId: null };

  // Usos por cliente
  if (usuario_id && cupon.uso_maximo_por_usuario) {
    const { count } = await supabase
      .from('pedidos').select('*', { count: 'exact', head: true })
      .eq('cupon_id', cupon.id).eq('usuario_id', usuario_id);
    if ((count ?? 0) >= cupon.uso_maximo_por_usuario) return { descuento: 0, cuponId: null };
  }

  const minima = Math.max(Number(cupon.compra_minima) || PISO_COMPRA, PISO_COMPRA);
  if (subtotal < minima) return { descuento: 0, cuponId: null };
  if (cupon.compra_maxima && subtotal > Number(cupon.compra_maxima)) return { descuento: 0, cuponId: null };

  // Base (categoría exclusiva → solo ítems de esa categoría)
  let base = subtotal;
  if (cupon.categoria_id) {
    base = r2(itemsCarrito.reduce((s, it) => (
      it.productos?.categoria_id === cupon.categoria_id
        ? s + precioItem(it, mapaOfertas) * parseInt(it.cantidad)
        : s
    ), 0));
    if (base <= 0) return { descuento: 0, cuponId: null };
  }

  let descuento;
  if (cupon.tipo_descuento === 'monto_fijo') {
    descuento = Number(cupon.valor);
  } else {
    descuento = base * (Number(cupon.valor) / 100);
    if (cupon.descuento_maximo) descuento = Math.min(descuento, Number(cupon.descuento_maximo));
  }
  descuento = r2(Math.min(descuento, base));
  return { descuento, cuponId: cupon.id };
}

// ── Todo en uno: subtotal real + descuento válido, desde el carrito de la BD ──
// itemsCarrito viene con productos(precio_normal, precio_oferta, categoria_id).
async function calcularTotales({ itemsCarrito, codigoCupon, usuario_id }) {
  const items = itemsCarrito ?? [];
  const mapaOfertas = await obtenerMapaOfertas(items);
  const subtotal = calcularSubtotal(items, mapaOfertas);
  const { descuento, cuponId } = await calcularDescuentoCupon({
    codigo: codigoCupon, usuario_id, itemsCarrito: items, mapaOfertas, subtotal,
  });
  return { subtotal, descuento, cuponId };
}

module.exports = { calcularTotales, obtenerMapaOfertas, calcularSubtotal, PISO_COMPRA, r2 };