import { EntityManager } from 'typeorm';
import { fechaHoy } from '../utils/fechas';

/**
 * Consultas de saldo de facturas (cartera y cuentas por pagar).
 * El saldo nunca se guarda: se calcula como total − pagos aplicados que no
 * estén anulados. Así una anulación de pago reabre el saldo sola.
 */

export const SQL_TOTAL_FACTURA_VENTA = (alias: string) => `(
  (SELECT COALESCE(ROUND(SUM(d.cantidad * d.valor_unitario
            * (1 - COALESCE(d.pct_descuento, 0) / 100)
            * (1 + COALESCE(d.pct_iva, 0) / 100)), 2), 0)
     FROM detalle_factura_venta d
    WHERE d.id_factura_venta = ${alias}.id_factura_venta)
  - COALESCE(${alias}.retefuente, 0)
)`;

export const SQL_PAGADO_FACTURA_VENTA = (alias: string) => `(
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
    FROM aplicacion_pago_venta a
    JOIN pagos p ON p.id_pago = a.id_pago
    JOIN estados_pago ep ON ep.id_estado = p.id_estado
   WHERE a.id_factura_venta = ${alias}.id_factura_venta
     AND ep.codigo <> 'ANULADO'
)`;

export const SQL_TOTAL_FACTURA_COMPRA = (alias: string) => `(
  SELECT COALESCE(ROUND(SUM(d.cantidad * d.costo_unitario
            * (1 + COALESCE(d.pct_iva, 0) / 100)), 2), 0)
    FROM detalle_factura_compra d
   WHERE d.id_factura_compra = ${alias}.id_factura_compra
)`;

export const SQL_PAGADO_FACTURA_COMPRA = (alias: string) => `(
  SELECT COALESCE(SUM(a.monto_aplicado), 0)
    FROM aplicacion_pago_compra a
    JOIN pagos p ON p.id_pago = a.id_pago
    JOIN estados_pago ep ON ep.id_estado = p.id_estado
   WHERE a.id_factura_compra = ${alias}.id_factura_compra
     AND ep.codigo <> 'ANULADO'
)`;

export interface SaldoFacturaVenta {
  idFactura: string;
  numeroVenta: string;
  idCliente: string;
  idTercero: string;
  cliente: string;
  documento: string;
  fechaExpedicion: string;
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
  fechaEmision: string;
  fechaVencimiento: string | null;
  estado: string;
  total: number;
  pagado: number;
  saldo: number;
  diasMora: number;
}

export interface FiltrosSaldo {
  id?: string;
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

export async function consultarSaldosVenta(
  db: EntityManager,
  filtros: FiltrosSaldo = {},
): Promise<SaldoFacturaVenta[]> {
  const params: any[] = [fechaHoy()];
  const condiciones = ['f.anulada = false'];

  if (!filtros.incluirCastigadas) condiciones.push(`e.codigo <> 'CASTIGADA'`);
  if (filtros.id) {
    params.push(filtros.id);
    condiciones.push(`f.id_factura_venta = $${params.length}`);
  }
  if (filtros.idContraparte) {
    params.push(filtros.idContraparte);
    condiciones.push(`f.id_cliente = $${params.length}`);
  }
  if (filtros.idTercero) {
    params.push(filtros.idTercero);
    condiciones.push(`c.id_tercero = $${params.length}`);
  }

  const filas = await db.query(
    `
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
        CROSS JOIN LATERAL (SELECT ${SQL_TOTAL_FACTURA_VENTA('f')} AS total) tot
        CROSS JOIN LATERAL (SELECT ${SQL_PAGADO_FACTURA_VENTA('f')} AS pagado) pag
       WHERE ${condiciones.join(' AND ')}
    ) x
    ${filtros.soloConSaldo ? 'WHERE x."saldo" > 0' : ''}
    ORDER BY x."fechaVencimiento" ASC NULLS LAST, x."numeroVenta"
    `,
    params,
  );

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
  const params: any[] = [fechaHoy()];
  const condiciones = [`e.codigo <> 'ANULADA'`];

  if (filtros.id) {
    params.push(filtros.id);
    condiciones.push(`fc.id_factura_compra = $${params.length}`);
  }
  if (filtros.idContraparte) {
    params.push(filtros.idContraparte);
    condiciones.push(`fc.id_proveedor = $${params.length}`);
  }
  if (filtros.idTercero) {
    params.push(filtros.idTercero);
    condiciones.push(`p.id_tercero = $${params.length}`);
  }

  const filas = await db.query(
    `
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
        CROSS JOIN LATERAL (SELECT ${SQL_TOTAL_FACTURA_COMPRA('fc')} AS total) tot
        CROSS JOIN LATERAL (SELECT ${SQL_PAGADO_FACTURA_COMPRA('fc')} AS pagado) pag
       WHERE ${condiciones.join(' AND ')}
    ) x
    ${filtros.soloConSaldo ? 'WHERE x."saldo" > 0' : ''}
    ORDER BY x."fechaVencimiento" ASC NULLS LAST, x."numeroFactura"
    `,
    params,
  );

  return filas.map((f: any) => {
    const fila = aNumero<SaldoFacturaCompra>(f, ['total', 'pagado', 'saldo', 'diasMora']);
    fila.fechaEmision = formatoFecha(f.fechaEmision);
    fila.fechaVencimiento = formatoFecha(f.fechaVencimiento);
    return fila;
  });
}
