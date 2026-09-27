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
