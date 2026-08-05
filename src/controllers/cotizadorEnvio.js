// =====================================================================
// WAYKES · Cotizador de envío  (backend Node/Express)
// Modelo confirmado:
//   - Base S/8.90 plano en todo Lima, hasta 10kg facturables.
//   - Sobre 10kg: +S/2.00 por kg de excedente (redondeo hacia arriba).
//     Ese excedente SIEMPRE lo paga el cliente; el cupón no lo cubre.
//   - Peso facturable por producto = max(peso_kg, volumétrico).
//     Volumétrico = largo_cm * ancho_cm * alto_cm / 4200.
//   - Peso del carrito = suma de (facturable_unitario * cantidad).
// Lógica pura, sin dependencias. Importar donde calcules el envío.
// =====================================================================

const ENVIO = {
  BASE: 8.90,            // S/ base hasta el umbral
  DIVISOR_VOL: 4200,     // divisor volumétrico
  UMBRAL_KG: 10,         // kg incluidos en la base
  TARIFA_EXCEDENTE: 2,   // S/ por kg sobre el umbral
  DEFAULT_PESO_KG: 1,    // fallback si un producto no tiene datos de peso/medidas
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Peso facturable de UNA unidad del producto (kg).
 * producto: { peso_kg, largo_cm, ancho_cm, alto_cm }
 * Devuelve también si hubo que usar el fallback por datos faltantes.
 */
function pesoFacturableUnitario(producto = {}) {
  const real = Number(producto.peso_kg) || 0;
  const l = Number(producto.largo_cm) || 0;
  const a = Number(producto.ancho_cm) || 0;
  const h = Number(producto.alto_cm) || 0;

  const volumetrico = (l * a * h) / ENVIO.DIVISOR_VOL;
  let facturable = Math.max(real, volumetrico);

  let datosIncompletos = false;
  if (facturable <= 0) {
    // Sin peso ni medidas útiles: asumimos un mínimo para no subvaluar el carrito.
    facturable = ENVIO.DEFAULT_PESO_KG;
    datosIncompletos = true;
  }
  return { facturable, datosIncompletos };
}

/**
 * Cotiza el envío del carrito.
 * items: [{ producto: { peso_kg, largo_cm, ancho_cm, alto_cm }, cantidad }]
 * Retorna el envío SIN descuento (base + excedente por peso).
 */
function cotizarEnvio(items = []) {
  let pesoFacturableTotal = 0;
  let algunDatoIncompleto = false;

  for (const item of items) {
    const cantidad = Number(item.cantidad) || 0;
    const { facturable, datosIncompletos } = pesoFacturableUnitario(item.producto);
    pesoFacturableTotal += facturable * cantidad;
    if (datosIncompletos) algunDatoIncompleto = true;
  }

  pesoFacturableTotal = round2(pesoFacturableTotal);

  const excedenteKg = Math.ceil(Math.max(0, pesoFacturableTotal - ENVIO.UMBRAL_KG));
  const excedente = excedenteKg * ENVIO.TARIFA_EXCEDENTE;
  const envioTotal = round2(ENVIO.BASE + excedente);

  return {
    pesoFacturableTotal,      // kg
    envioBase: ENVIO.BASE,    // porción descontable (8.90)
    excedenteKg,              // kg sobre el umbral (los paga el cliente)
    excedente,               // S/ de excedente por peso
    envioTotal,               // S/ envío sin descuento
    datosIncompletos: algunDatoIncompleto, // true si algún producto usó fallback
  };
}

/**
 * ¿El cupón de envío del vendedor es aplicable a este carrito?
 * cupon: fila de cupones_envio_vendedor { descuento, compra_minima, activo, fecha_inicio, fecha_fin }
 * contexto: { unicoVendedor:boolean, subtotal:number, tieneCuponProducto:boolean, ahora?:Date }
 * Reglas: carrito de un solo vendedor, activo, dentro de vigencia,
 *         subtotal >= compra_minima (si existe), y NO acumulable con cupón de producto.
 */
function esCuponEnvioAplicable(cupon, contexto = {}) {
  if (!cupon || !cupon.activo) return { aplica: false, motivo: 'cupon_inactivo' };

  const { unicoVendedor, subtotal = 0, tieneCuponProducto = false } = contexto;
  const ahora = contexto.ahora || new Date();

  if (!unicoVendedor)      return { aplica: false, motivo: 'carrito_multivendedor' };
  if (tieneCuponProducto)  return { aplica: false, motivo: 'no_acumulable_con_cupon_producto' };

  if (cupon.fecha_inicio && ahora < new Date(cupon.fecha_inicio))
    return { aplica: false, motivo: 'aun_no_vigente' };
  if (cupon.fecha_fin && ahora > new Date(cupon.fecha_fin))
    return { aplica: false, motivo: 'vencido' };

  if (cupon.compra_minima != null && Number(subtotal) < Number(cupon.compra_minima))
    return { aplica: false, motivo: 'no_alcanza_compra_minima' };

  return { aplica: true, motivo: 'ok' };
}

/**
 * Aplica el descuento del cupón sobre la cotización.
 * El subsidio TOPA en la base (8.90) -> el excedente por peso nunca se subsidia.
 * Devuelve exactamente los campos que persiste subsidios_envio.
 */
function aplicarCuponEnvio(cotizacion, descuentoCupon) {
  const base = cotizacion.envioBase;
  const total = cotizacion.envioTotal;

  const montoSubsidiado = round2(Math.min(Number(descuentoCupon) || 0, base));
  const envioCobradoCliente = round2(total - montoSubsidiado);

  return {
    descuento_cupon: round2(Number(descuentoCupon) || 0),
    envio_base_referencia: base,           // 8.90
    envio_total_sin_descuento: total,      // base + excedente
    monto_subsidiado: montoSubsidiado,     // lo que Waykes fronta (tope = base)
    envio_cobrado_cliente: envioCobradoCliente, // lo que paga el cliente
  };
}

module.exports = {
  ENVIO,
  pesoFacturableUnitario,
  cotizarEnvio,
  esCuponEnvioAplicable,
  aplicarCuponEnvio,
};