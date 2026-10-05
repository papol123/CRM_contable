export interface LineaDocumento {
  cantidad: number | string;
  valorUnitario: number | string;
  pctDescuento?: number | string;
  pctIva?: number | string;
}

export interface TotalesDocumento {
  subtotal: number;
  totalDescuento: number;
  subtotalNeto: number;
  totalIva: number;
  retefuente: number;
  total: number;
}

export function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

export function calcularLinea(linea: LineaDocumento) {
  const lineaBase = Number(linea.cantidad) * Number(linea.valorUnitario);
  const descuento = lineaBase * (Number(linea.pctDescuento || 0) / 100);
  const baseGravable = lineaBase - descuento;
  const iva = baseGravable * (Number(linea.pctIva || 0) / 100);
  return {
    lineaBase: redondear(lineaBase),
    descuento: redondear(descuento),
    baseGravable: redondear(baseGravable),
    iva: redondear(iva),
    totalLinea: redondear(baseGravable + iva),
  };
}

/**
 * Totales de una factura, cotización o pedido. Debe coincidir con
 * SQL_TOTAL_FACTURA_VENTA (saldos.ts): se redondea solo el total final.
 */
export function calcularTotales(
  lineas: LineaDocumento[],
  retefuente: number | string = 0,
): TotalesDocumento {
  let subtotal = 0;
  let totalDescuento = 0;
  let totalIva = 0;

  for (const linea of lineas || []) {
    const lineaBase = Number(linea.cantidad) * Number(linea.valorUnitario);
    const descuento = lineaBase * (Number(linea.pctDescuento || 0) / 100);
    subtotal += lineaBase;
    totalDescuento += descuento;
    totalIva += (lineaBase - descuento) * (Number(linea.pctIva || 0) / 100);
  }

  const rete = Number(retefuente || 0);
  return {
    subtotal: redondear(subtotal),
    totalDescuento: redondear(totalDescuento),
    subtotalNeto: redondear(subtotal - totalDescuento),
    totalIva: redondear(totalIva),
    retefuente: redondear(rete),
    total: redondear(subtotal - totalDescuento + totalIva - rete),
  };
}

export interface LineaCompra {
  cantidad: number | string;
  costoUnitario: number | string;
  pctDescuento?: number | string;
  pctIva?: number | string;
}

export interface TarifasRetencion {
  /** Retención en la fuente: % sobre la base (subtotal con descuento, sin IVA) */
  pctRetefuente?: number;
  /** ReteIVA: % sobre el IVA facturado (usualmente 15 %) */
  pctReteIva?: number;
  /** ReteICA: tarifa por mil sobre la base (p. ej. 9.66 ‰) */
  tarifaReteIcaPorMil?: number;
}

export interface TotalesCompra {
  subtotal: number;
  totalDescuento: number;
  base: number;
  totalIva: number;
  totalBruto: number;
  retefuente: number;
  reteiva: number;
  reteica: number;
  totalRetenciones: number;
  total: number;
}

/**
 * Totales de una compra con descuentos y retenciones. Debe coincidir con
 * SQL_TOTAL_FACTURA_COMPRA (saldos.ts): el bruto se redondea una vez y se le
 * restan las retenciones ya redondeadas.
 */
export function calcularTotalesCompra(
  lineas: LineaCompra[],
  tarifas: TarifasRetencion = {},
  retencionesFijas?: { retefuente: number | string; reteiva: number | string; reteica: number | string },
): TotalesCompra {
  let subtotal = 0;
  let totalDescuento = 0;
  let totalIva = 0;
  let bruto = 0;
  for (const l of lineas || []) {
    const lineaBase = Number(l.cantidad) * Number(l.costoUnitario);
    const descuento = lineaBase * (Number(l.pctDescuento || 0) / 100);
    const iva = (lineaBase - descuento) * (Number(l.pctIva || 0) / 100);
    subtotal += lineaBase;
    totalDescuento += descuento;
    totalIva += iva;
    bruto += lineaBase - descuento + iva;
  }
  const base = redondear(subtotal - totalDescuento);
  const ivaRedondeado = redondear(totalIva);

  const retefuente = retencionesFijas
    ? Number(retencionesFijas.retefuente || 0)
    : redondear(base * (Number(tarifas.pctRetefuente || 0) / 100));
  const reteiva = retencionesFijas
    ? Number(retencionesFijas.reteiva || 0)
    : redondear(ivaRedondeado * (Number(tarifas.pctReteIva || 0) / 100));
  const reteica = retencionesFijas
    ? Number(retencionesFijas.reteica || 0)
    : redondear(base * (Number(tarifas.tarifaReteIcaPorMil || 0) / 1000));
  const totalRetenciones = redondear(retefuente + reteiva + reteica);
  const totalBruto = redondear(bruto);

  return {
    subtotal: redondear(subtotal),
    totalDescuento: redondear(totalDescuento),
    base,
    totalIva: ivaRedondeado,
    totalBruto,
    retefuente,
    reteiva,
    reteica,
    totalRetenciones,
    total: redondear(totalBruto - totalRetenciones),
  };
}
