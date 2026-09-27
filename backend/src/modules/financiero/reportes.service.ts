import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  consultarSaldosCompra,
  consultarSaldosVenta,
  SQL_TOTAL_FACTURA_VENTA,
} from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { sqlCantidadConSigno } from '../../common/inventario/stock';
import { fechaHoy, rangoMes, sumarDias } from '../../common/utils/fechas';

/** Subtotal neto (antes de IVA, después de descuento) de una línea de venta. */
const SQL_NETO_LINEA = `d.cantidad * d.valor_unitario * (1 - COALESCE(d.pct_descuento, 0) / 100)`;

@Injectable()
export class ReportesService {
  constructor(private readonly dataSource: DataSource) {}

  private async escalar(sql: string, params: any[]): Promise<number> {
    const [fila] = await this.dataSource.query(sql, params);
    return Number(Object.values(fila ?? { v: 0 })[0] ?? 0);
  }

  async getDashboardResumen(fecha = fechaHoy()) {
    const ventas = await this.dataSource.query(
      `SELECT COUNT(*) AS facturas, COALESCE(SUM(${SQL_TOTAL_FACTURA_VENTA('f')}), 0) AS total
         FROM facturas_venta f
        WHERE f.anulada = false AND f.fecha_expedicion = $1`,
      [fecha],
    );

    const pagosDelDia = `
      SELECT COALESCE(SUM(p.monto), 0)
        FROM pagos p JOIN estados_pago ep ON ep.id_estado = p.id_estado
       WHERE ep.codigo <> 'ANULADO' AND p.fecha_pago = $1 AND p.tipo_pago = $2`;

    const alertasStockBajo = await this.escalar(
      `SELECT COUNT(*) FROM (
         SELECT p.id_producto
           FROM productos p
           LEFT JOIN movimientos_inventario m ON m.id_producto = p.id_producto
          WHERE p.activo AND p.maneja_inventario
          GROUP BY p.id_producto, p.stock_minimo
         HAVING COALESCE(SUM(${sqlCantidadConSigno('m')}), 0) <= p.stock_minimo
       ) x`,
      [],
    );

    return {
      fecha,
      ventasHoy: redondear(Number(ventas[0].total)),
      facturasEmitidasHoy: Number(ventas[0].facturas),
      recaudosHoy: redondear(await this.escalar(pagosDelDia, [fecha, 'factura de venta'])),
      pagosProveedoresHoy: redondear(await this.escalar(pagosDelDia, [fecha, 'factura de compra'])),
      gastosHoy: redondear(
        await this.escalar(
          `SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE anulado = false AND fecha = $1`,
          [fecha],
        ),
      ),
      alertasStockBajo,
      cotizacionesAbiertas: await this.escalar(
        `SELECT COUNT(*) FROM cotizaciones WHERE estado IN ('BORRADOR', 'APROBADA')`,
        [],
      ),
      pedidosPendientes: await this.escalar(
        `SELECT COUNT(*) FROM pedidos WHERE estado IN ('RECIBIDO', 'EN_PROCESO', 'ENVIADO', 'ENTREGADO')`,
        [],
      ),
    };
  }

  /** KPIs financieros del mes. `periodo` = 'YYYY-MM' (por defecto el mes actual). */
  async getDashboardFinanciero(periodo?: string) {
    const mes = periodo || fechaHoy().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      throw new BadRequestException('El periodo debe tener el formato YYYY-MM');
    }
    const { desde, hasta } = rangoMes(mes);

    const [ventas] = await this.dataSource.query(
      `SELECT COALESCE(SUM(${SQL_NETO_LINEA}), 0) AS neto,
              COALESCE(SUM(${SQL_NETO_LINEA} * COALESCE(d.pct_iva, 0) / 100), 0) AS iva
         FROM facturas_venta f
         JOIN detalle_factura_venta d ON d.id_factura_venta = f.id_factura_venta
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2`,
      [desde, hasta],
    );

    // Costo de lo vendido: salidas de kardex de facturas del periodo no anuladas
    const costoMercanciaVendida = await this.escalar(
      `SELECT COALESCE(SUM(m.cantidad * COALESCE(m.costo_unitario, 0)), 0)
         FROM movimientos_inventario m
         JOIN facturas_venta f ON f.id_factura_venta = m.origen_id
        WHERE m.origen_tabla = 'facturas_venta' AND m.tipo_movimiento = 'SALIDA'
          AND f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2`,
      [desde, hasta],
    );

    const gastosOperativos = await this.escalar(
      `SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE anulado = false AND fecha BETWEEN $1 AND $2`,
      [desde, hasta],
    );

    const recaudos = await this.escalar(
      `SELECT COALESCE(SUM(p.monto), 0)
         FROM pagos p JOIN estados_pago ep ON ep.id_estado = p.id_estado
        WHERE ep.codigo <> 'ANULADO' AND p.tipo_pago = 'factura de venta'
          AND p.fecha_pago BETWEEN $1 AND $2`,
      [desde, hasta],
    );

    const compras = await this.escalar(
      `SELECT COALESCE(SUM(d.cantidad * d.costo_unitario), 0)
         FROM facturas_compra fc
         JOIN estados_factura_compra e ON e.id_estado = fc.id_estado
         JOIN detalle_factura_compra d ON d.id_factura_compra = fc.id_factura_compra
        WHERE e.codigo <> 'ANULADA' AND fc.fecha_emision BETWEEN $1 AND $2`,
      [desde, hasta],
    );

    const cartera = await consultarSaldosVenta(this.dataSource.manager, { soloConSaldo: true });
    const porPagar = await consultarSaldosCompra(this.dataSource.manager, { soloConSaldo: true });

    const ingresosTotales = redondear(Number(ventas.neto));
    const utilidadBruta = redondear(ingresosTotales - costoMercanciaVendida);

    return {
      periodo: mes,
      desde,
      hasta,
      ingresosTotales,
      ivaGenerado: redondear(Number(ventas.iva)),
      costoMercanciaVendida: redondear(costoMercanciaVendida),
      utilidadBruta,
      margenBrutoPct: ingresosTotales > 0 ? `${((utilidadBruta / ingresosTotales) * 100).toFixed(2)}%` : '0.00%',
      gastosOperativos: redondear(gastosOperativos),
      utilidadOperativa: redondear(utilidadBruta - gastosOperativos),
      recaudosDelPeriodo: redondear(recaudos),
      comprasDelPeriodo: redondear(compras),
      carteraPorCobrar: redondear(cartera.reduce((acc, f) => acc + f.saldo, 0)),
      cuentasPorPagar: redondear(porPagar.reduce((acc, f) => acc + f.saldo, 0)),
    };
  }

  /** Reporte de ventas sin costos ni márgenes (lo puede ver el rol USUARIO). */
  async getReporteVentas(desde?: string, hasta?: string) {
    const fin = hasta?.slice(0, 10) || fechaHoy();
    const inicio = desde?.slice(0, 10) || sumarDias(fin, -29);
    if (inicio > fin) throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
    const params = [inicio, fin];

    const [resumen] = await this.dataSource.query(
      `SELECT COUNT(*) AS facturas, COALESCE(SUM(${SQL_TOTAL_FACTURA_VENTA('f')}), 0) AS total
         FROM facturas_venta f
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2`,
      params,
    );

    const topProductos = await this.dataSource.query(
      `SELECT p.codigo, p.nombre, SUM(d.cantidad) AS unidades, ROUND(SUM(${SQL_NETO_LINEA}), 2) AS total
         FROM facturas_venta f
         JOIN detalle_factura_venta d ON d.id_factura_venta = f.id_factura_venta
         JOIN productos p ON p.id_producto = d.id_producto
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2
        GROUP BY p.codigo, p.nombre
        ORDER BY total DESC
        LIMIT 10`,
      params,
    );

    const topClientes = await this.dataSource.query(
      `SELECT t.razon_social AS cliente, COUNT(*) AS facturas,
              ROUND(SUM(${SQL_TOTAL_FACTURA_VENTA('f')}), 2) AS total
         FROM facturas_venta f
         JOIN clientes c ON c.id_cliente = f.id_cliente
         JOIN terceros t ON t.id_tercero = c.id_tercero
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2
        GROUP BY t.razon_social
        ORDER BY total DESC
        LIMIT 10`,
      params,
    );

    const ventasPorDia = await this.dataSource.query(
      `SELECT to_char(f.fecha_expedicion, 'YYYY-MM-DD') AS fecha, COUNT(*) AS facturas,
              ROUND(SUM(${SQL_TOTAL_FACTURA_VENTA('f')}), 2) AS total
         FROM facturas_venta f
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2
        GROUP BY f.fecha_expedicion
        ORDER BY f.fecha_expedicion`,
      params,
    );

    const totalFacturas = Number(resumen.facturas);
    const totalVentas = redondear(Number(resumen.total));
    const numeros = (filas: any[], campos: string[]) =>
      filas.map((f) => {
        for (const c of campos) f[c] = Number(f[c]);
        return f;
      });

    return {
      desde: inicio,
      hasta: fin,
      totalVentas,
      totalFacturas,
      ticketPromedio: totalFacturas > 0 ? redondear(totalVentas / totalFacturas) : 0,
      topProductos: numeros(topProductos, ['unidades', 'total']),
      topClientes: numeros(topClientes, ['facturas', 'total']),
      ventasPorDia: numeros(ventasPorDia, ['facturas', 'total']),
    };
  }
}
