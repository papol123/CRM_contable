import { EntityManager } from 'typeorm';
import { fechaHoy } from '../utils/fechas';

/**
 * Consultas de saldo de facturas (cartera y cuentas por pagar).
 * El saldo nunca se guarda: se calcula como total − pagos aplicados que no
 * estén anulados. Así una anulación de pago reabre el saldo sola.
 *
 * GEMINI.md §4.5: el SQL es fijo. Los filtros opcionales van como parámetros
 * (`$n IS NULL OR ...`); no se arma texto SQL con variables.
 * Los fragmentos SQL_* son constantes y usan siempre los alias `f` (facturas_venta)
 * y `fc` (facturas_compra).
 */

/** Total de la remisión `f`: líneas con descuento e IVA, menos retención. */
export const SQL_TOTAL_FACTURA_VENTA = `(
  (SELECT COALESCE(ROUND(SUM(d.cantidad * d.valor_unitario
            * (1 - COALESCE(d.pct_descuento, 0) / 100)
            * (1 + COALESCE(d.pct_iva, 0) / 100)), 2), 0)
     FROM detalle_factura_venta d
    WHERE d.id_factura_venta = f.id_factura_venta)
  - COALESCE(f.retefuente, 0)
)`;

/** Pagos vigentes aplicados a la remisión `f`. */
export const SQL_PAGADO_FACTURA_VENTA = `(
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
    FROM aplicacion_pago_venta a
    JOIN pagos p ON p.id_pago = a.id_pago
    JOIN estados_pago ep ON ep.id_estado = p.id_estado
   WHERE a.id_factura_venta = f.id_factura_venta
     AND ep.codigo <> 'ANULADO'
)`;

/** Total a pagar de la compra `fc`: líneas con descuento e IVA menos retenciones. Debe coincidir con calcularTotalesCompra. */
export const SQL_TOTAL_FACTURA_COMPRA = `(
  (SELECT COALESCE(ROUND(SUM(d.cantidad * d.costo_unitario
            * (1 - COALESCE(d.pct_descuento, 0) / 100)
            * (1 + COALESCE(d.pct_iva, 0) / 100)), 2), 0)
     FROM detalle_factura_compra d
    WHERE d.id_factura_compra = fc.id_factura_compra)
  - COALESCE(fc.retefuente, 0) - COALESCE(fc.reteiva, 0) - COALESCE(fc.reteica, 0)
)`;

/** Pagos vigentes aplicados a la compra `fc`. */
export const SQL_PAGADO_FACTURA_COMPRA = `(
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
    FROM aplicacion_pago_compra a
    JOIN pagos p ON p.id_pago = a.id_pago
    JOIN estados_pago ep ON ep.id_estado = p.id_estado
   WHERE a.id_factura_compra = fc.id_factura_compra
     AND ep.codigo <> 'ANULADO'
)`;

export interface SaldoFacturaVenta {
  idFactura: string;
  numeroVenta: string;
  idCliente: string;
  idTercero: string;
  cliente: string;
  documento: string;
  fechaExpedicion: string | null;
  fechaVencimiento: string | null;
  estado: string;
  total: number;
  pagado: number;
  saldo: number;
  diasMora: number;
}

export interface SaldoFacturaCompra {
  idFacturaCompra: string;
  numeroFactura: string | null;
  idProveedor: string;
  idTercero: string;
  proveedor: string;
  documento: string;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  estado: string;
  total: number;
  pagado: number;
  saldo: number;
  diasMora: number;
}

export interface FiltrosSaldo {
  id?: string;
  /** Varias facturas a la vez (p. ej. la página actual de un listado) */
  ids?: string[];
  idTercero?: string;
  /** id_cliente o id_proveedor según el tipo de factura */
  idContraparte?: string;
  soloConSaldo?: boolean;
  /** Incluir facturas CASTIGADAS (por defecto se excluyen de la cartera) */
  incluirCastigadas?: boolean;
}

function aNumero<T>(fila: any, campos: string[]): T {
  for (const c of campos) fila[c] = Number(fila[c] ?? 0);
  return fila as T;
}

function formatoFecha(valor: any): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

const SQL_SALDOS_VENTA = `
  SELECT * FROM (
    SELECT f.id_factura_venta   AS "idFactura",
           f.numero_venta       AS "numeroVenta",
           f.id_cliente         AS "idCliente",
           c.id_tercero         AS "idTercero",
           t.razon_social       AS "cliente",
           t.numero_documento   AS "documento",
           f.fecha_expedicion   AS "fechaExpedicion",
           f.fecha_vencimiento  AS "fechaVencimiento",
           e.codigo             AS "estado",
           tot.total            AS "total",
           pag.pagado           AS "pagado",
           tot.total - pag.pagado AS "saldo",
           CASE WHEN tot.total - pag.pagado > 0 AND f.fecha_vencimiento < $1::date
                THEN ($1::date - f.fecha_vencimiento) ELSE 0 END AS "diasMora"
      FROM facturas_venta f
      JOIN clientes c ON c.id_cliente = f.id_cliente
      JOIN terceros t ON t.id_tercero = c.id_tercero
      JOIN estados_factura_venta e ON e.id_estado = f.id_estado
      CROSS JOIN LATERAL (SELECT ${SQL_TOTAL_FACTURA_VENTA} AS total) tot
      CROSS JOIN LATERAL (SELECT ${SQL_PAGADO_FACTURA_VENTA} AS pagado) pag
     WHERE f.anulada = false
       AND ($2::boolean OR e.codigo <> 'CASTIGADA')
       AND ($3::uuid IS NULL OR f.id_factura_venta = $3::uuid)
       AND ($4::uuid[] IS NULL OR f.id_factura_venta = ANY($4::uuid[]))
       AND ($5::uuid IS NULL OR f.id_cliente = $5::uuid)
       AND ($6::uuid IS NULL OR c.id_tercero = $6::uuid)
  ) x
  WHERE (NOT $7::boolean OR x."saldo" > 0)
  ORDER BY x."fechaVencimiento" ASC NULLS LAST, x."numeroVenta"`;

const SQL_SALDOS_COMPRA = `
  SELECT * FROM (
    SELECT fc.id_factura_compra AS "idFacturaCompra",
           fc.numero_factura    AS "numeroFactura",
           fc.id_proveedor      AS "idProveedor",
           p.id_tercero         AS "idTercero",
           t.razon_social       AS "proveedor",
           t.numero_documento   AS "documento",
           fc.fecha_emision     AS "fechaEmision",
           fc.fecha_vencimiento AS "fechaVencimiento",
           e.codigo             AS "estado",
           tot.total            AS "total",
           pag.pagado           AS "pagado",
           tot.total - pag.pagado AS "saldo",
           CASE WHEN tot.total - pag.pagado > 0 AND fc.fecha_vencimiento < $1::date
                THEN ($1::date - fc.fecha_vencimiento) ELSE 0 END AS "diasMora"
      FROM facturas_compra fc
      JOIN proveedores p ON p.id_proveedor = fc.id_proveedor
      JOIN terceros t ON t.id_tercero = p.id_tercero
      JOIN estados_factura_compra e ON e.id_estado = fc.id_estado
      CROSS JOIN LATERAL (SELECT ${SQL_TOTAL_FACTURA_COMPRA} AS total) tot
      CROSS JOIN LATERAL (SELECT ${SQL_PAGADO_FACTURA_COMPRA} AS pagado) pag
     WHERE e.codigo <> 'ANULADA'
       AND ($2::uuid IS NULL OR fc.id_factura_compra = $2::uuid)
       AND ($3::uuid[] IS NULL OR fc.id_factura_compra = ANY($3::uuid[]))
       AND ($4::uuid IS NULL OR fc.id_proveedor = $4::uuid)
       AND ($5::uuid IS NULL OR p.id_tercero = $5::uuid)
  ) x
  WHERE (NOT $6::boolean OR x."saldo" > 0)
  ORDER BY x."fechaVencimiento" ASC NULLS LAST, x."numeroFactura"`;

export async function consultarSaldosVenta(
  db: EntityManager,
  filtros: FiltrosSaldo = {},
): Promise<SaldoFacturaVenta[]> {
  const filas = await db.query(SQL_SALDOS_VENTA, [
    fechaHoy(),
    !!filtros.incluirCastigadas,
    filtros.id ?? null,
    filtros.ids ?? null,
    filtros.idContraparte ?? null,
    filtros.idTercero ?? null,
    !!filtros.soloConSaldo,
  ]);

  return filas.map((f: any) => {
    const fila = aNumero<SaldoFacturaVenta>(f, ['total', 'pagado', 'saldo', 'diasMora']);
    fila.fechaExpedicion = formatoFecha(f.fechaExpedicion);
    fila.fechaVencimiento = formatoFecha(f.fechaVencimiento);
    return fila;
  });
}

export async function consultarSaldosCompra(
  db: EntityManager,
  filtros: FiltrosSaldo = {},
): Promise<SaldoFacturaCompra[]> {
  const filas = await db.query(SQL_SALDOS_COMPRA, [
    fechaHoy(),
    filtros.id ?? null,
    filtros.ids ?? null,
    filtros.idContraparte ?? null,
    filtros.idTercero ?? null,
    !!filtros.soloConSaldo,
  ]);

  return filas.map((f: any) => {
    const fila = aNumero<SaldoFacturaCompra>(f, ['total', 'pagado', 'saldo', 'diasMora']);
    fila.fechaEmision = formatoFecha(f.fechaEmision);
    fila.fechaVencimiento = formatoFecha(f.fechaVencimiento);
    return fila;
  });
}
