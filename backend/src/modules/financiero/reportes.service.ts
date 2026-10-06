import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  consultarSaldosCompra,
  consultarSaldosVenta,
  SQL_TOTAL_FACTURA_COMPRA,
  SQL_TOTAL_FACTURA_VENTA,
} from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { SQL_CANTIDAD_CON_SIGNO } from '../../common/inventario/stock';
import { fechaHoy, rangoMes, sumarDias } from '../../common/utils/fechas';
import { JobsService } from '../../common/jobs/jobs.service';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { generarCsv } from '../../common/exportacion/csv';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { InventarioService } from '../inventario/inventario.service';
import { Actor } from '../auth/decorators/actor.decorator';
import {
  CierreMensualDto,
  DashboardConfigDto,
  ExportarReporteDto,
  ParametrosReporteDto,
  TipoReporte,
} from './dto/reportes.dto';

/** Subtotal neto (antes de IVA, después de descuento) de una línea de venta. */
const SQL_NETO_LINEA = `d.cantidad * d.valor_unitario * (1 - COALESCE(d.pct_descuento, 0) / 100)`;
/** Base de una línea de compra (con descuento, sin IVA): es el costo para el estado de resultados. */
const SQL_BASE_LINEA_COMPRA = `d.cantidad * d.costo_unitario * (1 - COALESCE(d.pct_descuento, 0) / 100)`;

const JOB_EXPORTAR = 'EXPORTAR_REPORTE';
const CONFIG_DASHBOARD_POR_DEFECTO = { graficas: ['ventas_mes', 'top_productos', 'cartera_vencida', 'kpis_operativos'] };

/** Permiso necesario para exportar cada reporte (mismo que para consultarlo). */
const PERMISO_REPORTE: Record<TipoReporte, string> = {
  ventas: 'ventas.consultar',
  inventario: 'inventario.consultar',
  cartera: 'cartera.consultar',
  compras: 'reportes.financieros',
  gastos: 'gastos.consultar_todos',
  utilidad: 'reportes.financieros',
  rentabilidad: 'reportes.financieros',
  'flujo-caja': 'reportes.financieros',
  'ventas-por-vendedor': 'reportes.financieros',
  'estado-resultados': 'reportes.financieros',
  'inventario-valorizado': 'inventario.costos',
};

interface Rango {
  desde: string;
  hasta: string;
}

function rango(desde?: string, hasta?: string, diasPorDefecto = 30): Rango {
  const fin = hasta?.slice(0, 10) || fechaHoy();
  const inicio = desde?.slice(0, 10) || sumarDias(fin, -(diasPorDefecto - 1));
  if (inicio > fin) throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
  return { desde: inicio, hasta: fin };
}

function aNumeros<T extends Record<string, any>>(filas: T[], campos: string[]): T[] {
  return filas.map((f) => {
    for (const c of campos) (f as any)[c] = Number(f[c] ?? 0);
    return f;
  });
}

@Injectable()
export class ReportesService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jobs: JobsService,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly auditoria: AuditoriaService,
    private readonly inventario: InventarioService,
  ) {}

  onModuleInit() {
    this.jobs.registrar(JOB_EXPORTAR, async (job) => {
      const { tipo, parametros } = job.parametros as { tipo: TipoReporte; parametros: ParametrosReporteDto };
      const filas = await this.filasReporte(tipo, parametros || {});
      const csv = generarCsv(filas);
      const ruta = this.almacenamiento.generarRuta(`exportaciones/${tipo}`, '.csv');
      await this.almacenamiento.guardar(ruta, csv, 'text/csv');
      return { rutaArchivo: ruta, resumen: { tipo, filas: filas.length } };
    });
  }

  private async escalar(sql: string, params: any[], db: EntityManager = this.dataSource.manager): Promise<number> {
    const [fila] = await db.query(sql, params);
    return Number(Object.values(fila ?? { v: 0 })[0] ?? 0);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  /** KPIs operativos del día: volumen, sin costos ni márgenes (los ve el Usuario). */
  async getDashboardResumen(fecha = fechaHoy()) {
    const [ventas] = await this.dataSource.query(
      `SELECT COUNT(*) AS remisiones, COALESCE(SUM(${SQL_TOTAL_FACTURA_VENTA}), 0) AS total
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
         HAVING COALESCE(SUM(${SQL_CANTIDAD_CON_SIGNO}), 0) <= p.stock_minimo
       ) x`,
      [],
    );

    return {
      fecha,
      ventasHoy: redondear(Number(ventas.total)),
      remisionesEmitidasHoy: Number(ventas.remisiones),
      recaudosHoy: redondear(await this.escalar(pagosDelDia, [fecha, 'factura de venta'])),
      pagosProveedoresHoy: redondear(await this.escalar(pagosDelDia, [fecha, 'factura de compra'])),
      gastosHoy: redondear(
        await this.escalar(`SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE anulado = false AND fecha = $1`, [fecha]),
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

  async getDashboardConfig(idUsuario: string) {
    const [fila] = await this.dataSource.query(
      `SELECT config FROM dashboard_config_usuario WHERE id_usuario = $1`,
      [idUsuario],
    );
    if (fila) return fila.config;

    const [porDefecto] = await this.dataSource.query(
      `SELECT valor FROM configuracion_sistema WHERE clave = 'DASHBOARD_CONFIG_DEFAULT'`,
    );
    try {
      return porDefecto ? JSON.parse(porDefecto.valor) : CONFIG_DASHBOARD_POR_DEFECTO;
    } catch {
      return CONFIG_DASHBOARD_POR_DEFECTO;
    }
  }

  /** Cada usuario guarda su propia configuración. */
  async saveDashboardConfig(config: DashboardConfigDto, idUsuario: string) {
    if (config.preferencias && JSON.stringify(config.preferencias).length > 4096) {
      throw new BadRequestException('Las preferencias del dashboard no pueden superar 4 KB');
    }
    await this.dataSource.query(
      `INSERT INTO dashboard_config_usuario (id_usuario, config) VALUES ($1, $2)
       ON CONFLICT (id_usuario) DO UPDATE SET config = EXCLUDED.config, actualizado_en = now()`,
      [idUsuario, JSON.stringify(config)],
    );
    return config;
  }

  // ─── Resultados (base de los reportes financieros) ─────────────────────────

  /** Ingresos, costo de lo vendido, gastos y utilidad de un rango de fechas. */
  private async resultados(r: Rango, db: EntityManager = this.dataSource.manager) {
    const [ventas] = await db.query(
      `SELECT COALESCE(SUM(${SQL_NETO_LINEA}), 0) AS neto,
              COALESCE(SUM(${SQL_NETO_LINEA} * COALESCE(d.pct_iva, 0) / 100), 0) AS iva
         FROM facturas_venta f
         JOIN detalle_factura_venta d ON d.id_factura_venta = f.id_factura_venta
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2`,
      [r.desde, r.hasta],
    );

    // Costo de lo vendido: salidas de kardex de las remisiones del rango no anuladas
    const costoMercanciaVendida = await this.escalar(
      `SELECT COALESCE(SUM(m.cantidad * COALESCE(m.costo_unitario, 0)), 0)
         FROM movimientos_inventario m
         JOIN facturas_venta f ON f.id_factura_venta = m.origen_id
        WHERE m.origen_tabla = 'facturas_venta' AND m.tipo_movimiento = 'SALIDA'
          AND f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2`,
      [r.desde, r.hasta],
      db,
    );

    const gastosOperativos = await this.escalar(
      `SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE anulado = false AND fecha BETWEEN $1 AND $2`,
      [r.desde, r.hasta],
      db,
    );

    const ingresosTotales = redondear(Number(ventas.neto));
    const utilidadBruta = redondear(ingresosTotales - costoMercanciaVendida);
    return {
      desde: r.desde,
      hasta: r.hasta,
      ingresosTotales,
      ivaGenerado: redondear(Number(ventas.iva)),
      costoMercanciaVendida: redondear(costoMercanciaVendida),
      utilidadBruta,
      margenBrutoPct: ingresosTotales > 0 ? Number(((utilidadBruta / ingresosTotales) * 100).toFixed(2)) : 0,
      gastosOperativos: redondear(gastosOperativos),
      utilidadOperativa: redondear(utilidadBruta - gastosOperativos),
    };
  }

  async getDashboardFinanciero(periodo?: string) {
    const mes = periodo || fechaHoy().slice(0, 7);
    const r = rangoMes(mes);
    const base = await this.resultados(r);

    const recaudos = await this.escalar(
      `SELECT COALESCE(SUM(p.monto), 0)
         FROM pagos p JOIN estados_pago ep ON ep.id_estado = p.id_estado
        WHERE ep.codigo <> 'ANULADO' AND p.tipo_pago = 'factura de venta'
          AND p.fecha_pago BETWEEN $1 AND $2`,
      [r.desde, r.hasta],
    );
    const compras = await this.escalar(
      `SELECT COALESCE(SUM(${SQL_BASE_LINEA_COMPRA}), 0)
         FROM facturas_compra fc
         JOIN estados_factura_compra e ON e.id_estado = fc.id_estado
         JOIN detalle_factura_compra d ON d.id_factura_compra = fc.id_factura_compra
        WHERE e.codigo <> 'ANULADA' AND fc.fecha_emision BETWEEN $1 AND $2`,
      [r.desde, r.hasta],
    );

    const cartera = await consultarSaldosVenta(this.dataSource.manager, { soloConSaldo: true });
    const porPagar = await consultarSaldosCompra(this.dataSource.manager, { soloConSaldo: true });

    return {
      periodo: mes,
      ...base,
      recaudosDelPeriodo: redondear(recaudos),
      comprasDelPeriodo: redondear(compras),
      carteraPorCobrar: redondear(cartera.reduce((acc, f) => acc + f.saldo, 0)),
      cuentasPorPagar: redondear(porPagar.reduce((acc, f) => acc + f.saldo, 0)),
    };
  }

  // ─── Reportes operativos ───────────────────────────────────────────────────

  /** Ventas por periodo, cliente y producto: volumen sin costos ni márgenes (catálogo §17). */
  async getReporteVentas(desde?: string, hasta?: string) {
    const r = rango(desde, hasta);
    const params = [r.desde, r.hasta];

    const [resumen] = await this.dataSource.query(
      `SELECT COUNT(*) AS remisiones, COALESCE(SUM(${SQL_TOTAL_FACTURA_VENTA}), 0) AS total
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
      `SELECT t.razon_social AS cliente, COUNT(*) AS remisiones,
              ROUND(SUM(${SQL_TOTAL_FACTURA_VENTA}), 2) AS total
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
      `SELECT to_char(f.fecha_expedicion, 'YYYY-MM-DD') AS fecha, COUNT(*) AS remisiones,
              ROUND(SUM(${SQL_TOTAL_FACTURA_VENTA}), 2) AS total
         FROM facturas_venta f
        WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2
        GROUP BY f.fecha_expedicion
        ORDER BY f.fecha_expedicion`,
      params,
    );

    const totalRemisiones = Number(resumen.remisiones);
    const totalVentas = redondear(Number(resumen.total));
    return {
      ...r,
      totalVentas,
      totalRemisiones,
      ticketPromedio: totalRemisiones > 0 ? redondear(totalVentas / totalRemisiones) : 0,
      topProductos: aNumeros(topProductos, ['unidades', 'total']),
      topClientes: aNumeros(topClientes, ['remisiones', 'total']),
      ventasPorDia: aNumeros(ventasPorDia, ['remisiones', 'total']),
    };
  }

  /** Existencias y rotación (unidades vendidas en los últimos 90 días). Sin costos. */
  async getReporteInventario() {
    const filas = await this.dataSource.query(
      `WITH saldos AS (
         SELECT m.id_producto, SUM(${SQL_CANTIDAD_CON_SIGNO}) AS stock
           FROM movimientos_inventario m GROUP BY m.id_producto
       ), vendidas AS (
         SELECT d.id_producto, SUM(d.cantidad) AS unidades
           FROM detalle_factura_venta d
           JOIN facturas_venta f ON f.id_factura_venta = d.id_factura_venta
          WHERE f.anulada = false AND f.fecha_expedicion > ($1::date - 90)
          GROUP BY d.id_producto
       )
       SELECT p.codigo, p.nombre, cat.nombre AS categoria,
              COALESCE(s.stock, 0) AS "stockActual", p.stock_minimo AS "stockMinimo",
              COALESCE(v.unidades, 0) AS "vendidas90Dias"
         FROM productos p
         LEFT JOIN categorias_producto cat ON cat.id_categoria = p.id_categoria
         LEFT JOIN saldos s ON s.id_producto = p.id_producto
         LEFT JOIN vendidas v ON v.id_producto = p.id_producto
        WHERE p.activo AND p.maneja_inventario
        ORDER BY p.nombre`,
      [fechaHoy()],
    );

    const items = aNumeros(filas, ['stockActual', 'stockMinimo', 'vendidas90Dias']).map((f: any) => {
      const ventaDiaria = f.vendidas90Dias / 90;
      return {
        ...f,
        // Veces que el stock actual se vendió en 90 días y días de inventario al ritmo actual
        rotacion90Dias: f.stockActual > 0 ? redondear(f.vendidas90Dias / f.stockActual) : null,
        diasDeInventario: ventaDiaria > 0 ? Math.round(f.stockActual / ventaDiaria) : null,
        bajoStockMinimo: f.stockActual <= f.stockMinimo,
      };
    });
    return {
      fechaCorte: fechaHoy(),
      totalProductos: items.length,
      bajoStockMinimo: items.filter((i: any) => i.bajoStockMinimo).length,
      items,
    };
  }

  /** Cartera por edades y por cliente, con saldos reales (total − abonos). */
  async getReporteCartera() {
    const pendientes = await consultarSaldosVenta(this.dataSource.manager, { soloConSaldo: true });
    const porCliente = new Map<string, any>();
    for (const f of pendientes) {
      const c = porCliente.get(f.idCliente) ?? {
        idCliente: f.idCliente,
        cliente: f.cliente,
        documento: f.documento,
        remisiones: 0,
        alDia: 0,
        de1a30: 0,
        de31a60: 0,
        de61a90: 0,
        mas90: 0,
        saldoTotal: 0,
      };
      const tramo =
        f.diasMora <= 0 ? 'alDia' : f.diasMora <= 30 ? 'de1a30' : f.diasMora <= 60 ? 'de31a60' : f.diasMora <= 90 ? 'de61a90' : 'mas90';
      c[tramo] = redondear(c[tramo] + f.saldo);
      c.saldoTotal = redondear(c.saldoTotal + f.saldo);
      c.remisiones++;
      porCliente.set(f.idCliente, c);
    }
    const clientes = [...porCliente.values()].sort((a, b) => b.saldoTotal - a.saldoTotal);
    const sumar = (campo: string) => redondear(clientes.reduce((acc, c) => acc + c[campo], 0));
    return {
      fechaCorte: fechaHoy(),
      totales: {
        alDia: sumar('alDia'),
        de1a30: sumar('de1a30'),
        de31a60: sumar('de31a60'),
        de61a90: sumar('de61a90'),
        mas90: sumar('mas90'),
        saldoTotal: sumar('saldoTotal'),
      },
      clientes,
    };
  }

  // ─── Reportes financieros (solo reportes.financieros) ──────────────────────

  async getReporteUtilidad(desde?: string, hasta?: string) {
    return this.resultados(rango(desde, hasta));
  }

  /** Rentabilidad por producto: venta neta vs. costo del kardex de las mismas remisiones. */
  async getReporteRentabilidad(desde?: string, hasta?: string) {
    const r = rango(desde, hasta);
    const filas = await this.dataSource.query(
      `WITH ventas AS (
         SELECT d.id_producto, SUM(d.cantidad) AS unidades, SUM(${SQL_NETO_LINEA}) AS venta
           FROM facturas_venta f
           JOIN detalle_factura_venta d ON d.id_factura_venta = f.id_factura_venta
          WHERE f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2
          GROUP BY d.id_producto
       ), costos AS (
         SELECT m.id_producto, SUM(m.cantidad * COALESCE(m.costo_unitario, 0)) AS costo
           FROM movimientos_inventario m
           JOIN facturas_venta f ON f.id_factura_venta = m.origen_id
          WHERE m.origen_tabla = 'facturas_venta' AND m.tipo_movimiento = 'SALIDA'
            AND f.anulada = false AND f.fecha_expedicion BETWEEN $1 AND $2
          GROUP BY m.id_producto
       )
       SELECT p.codigo, p.nombre, v.unidades,
              ROUND(v.venta, 2) AS "ventaNeta",
              ROUND(COALESCE(c.costo, 0), 2) AS "costo",
              ROUND(v.venta - COALESCE(c.costo, 0), 2) AS "margen"
         FROM ventas v
         JOIN productos p ON p.id_producto = v.id_producto
         LEFT JOIN costos c ON c.id_producto = v.id_producto
        ORDER BY margen DESC`,
      [r.desde, r.hasta],
    );
    const productos = aNumeros(filas, ['unidades', 'ventaNeta', 'costo', 'margen']).map((p: any) => ({
      ...p,
      margenPct: p.ventaNeta > 0 ? Number(((p.margen / p.ventaNeta) * 100).toFixed(2)) : 0,
    }));
    return { ...r, productos };
  }

  async getReporteFlujoCaja(desde?: string, hasta?: string) {
    const r = rango(desde, hasta);
    const pagos = (tipo: string) =>
      this.escalar(
        `SELECT COALESCE(SUM(p.monto), 0) FROM pagos p JOIN estados_pago ep ON ep.id_estado = p.id_estado
          WHERE ep.codigo <> 'ANULADO' AND p.tipo_pago = $3 AND p.fecha_pago BETWEEN $1 AND $2`,
        [r.desde, r.hasta, tipo],
      );
    const ingresos = await pagos('factura de venta');
    const egresosProveedores = await pagos('factura de compra');
    const egresosGastos = await this.escalar(
      `SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE anulado = false AND fecha BETWEEN $1 AND $2`,
      [r.desde, r.hasta],
    );
    const totalEgresos = redondear(egresosProveedores + egresosGastos);
    return {
      ...r,
      totalIngresos: redondear(ingresos),
      egresosProveedores: redondear(egresosProveedores),
      egresosGastos: redondear(egresosGastos),
      totalEgresos,
      flujoNetoCaja: redondear(ingresos - totalEgresos),
    };
  }

  /** Gastos de todos los usuarios, con totales por categoría. */
  async getReporteGastos(desde?: string, hasta?: string) {
    const r = rango(desde, hasta);
    const gastos = aNumeros(
      await this.dataSource.query(
        `SELECT g.id_gasto AS id, g.fecha, g.descripcion, g.monto, cg.nombre AS categoria,
                NULLIF(TRIM(CONCAT(u.nombres, ' ', u.apellidos)), '') AS usuario
           FROM gastos g
           JOIN categorias_gasto cg ON cg.id_categoria_gasto = g.id_categoria_gasto
           LEFT JOIN usuarios u ON u.id_usuario = g.id_usuario
          WHERE g.anulado = false AND g.fecha BETWEEN $1 AND $2
          ORDER BY g.fecha DESC`,
        [r.desde, r.hasta],
      ),
      ['monto'],
    );
    const porCategoria = new Map<string, number>();
    for (const g of gastos) porCategoria.set(g.categoria, redondear((porCategoria.get(g.categoria) || 0) + g.monto));
    return {
      ...r,
      total: redondear(gastos.reduce((acc: number, g: any) => acc + g.monto, 0)),
      porCategoria: [...porCategoria.entries()].map(([categoria, total]) => ({ categoria, total })),
      gastos,
    };
  }

  /** Compras del rango con base, IVA, retenciones y total a pagar. */
  async getReporteCompras(desde?: string, hasta?: string) {
    const r = rango(desde, hasta);
    const compras = aNumeros(
      await this.dataSource.query(
        `SELECT fc.id_factura_compra AS id, fc.numero_factura AS "numeroFactura", fc.fecha_emision AS "fechaEmision",
                t.razon_social AS proveedor,
                ROUND(SUM(${SQL_BASE_LINEA_COMPRA}), 2) AS base,
                ROUND(SUM(${SQL_BASE_LINEA_COMPRA} * COALESCE(d.pct_iva, 0) / 100), 2) AS iva,
                fc.retefuente, fc.reteiva, fc.reteica,
                ${SQL_TOTAL_FACTURA_COMPRA} AS total
           FROM facturas_compra fc
           JOIN estados_factura_compra e ON e.id_estado = fc.id_estado AND e.codigo <> 'ANULADA'
           JOIN proveedores pr ON pr.id_proveedor = fc.id_proveedor
           JOIN terceros t ON t.id_tercero = pr.id_tercero
           JOIN detalle_factura_compra d ON d.id_factura_compra = fc.id_factura_compra
          WHERE fc.fecha_emision BETWEEN $1 AND $2
          GROUP BY fc.id_factura_compra, fc.numero_factura, fc.fecha_emision, t.razon_social
          ORDER BY fc.fecha_emision DESC`,
        [r.desde, r.hasta],
      ),
      ['base', 'iva', 'retefuente', 'reteiva', 'reteica', 'total'],
    );
    const sumar = (campo: string) => redondear(compras.reduce((acc: number, c: any) => acc + c[campo], 0));
    return {
      ...r,
      totales: {
        base: sumar('base'),
        iva: sumar('iva'),
        retefuente: sumar('retefuente'),
        reteiva: sumar('reteiva'),
        reteica: sumar('reteica'),
        total: sumar('total'),
      },
      compras,
    };
  }

  async getReporteVentasPorVendedor(desde?: string, hasta?: string) {
    const r = rango(desde, hasta);
    const filas = await this.dataSource.query(
      `SELECT u.id_usuario AS "idUsuario", u.nombres, u.apellidos, u.email,
              COUNT(f.id_factura_venta) AS remisiones,
              ROUND(COALESCE(SUM(${SQL_TOTAL_FACTURA_VENTA}), 0), 2) AS "totalVendido"
         FROM usuarios u
         LEFT JOIN facturas_venta f ON f.id_usuario = u.id_usuario AND f.anulada = false
                                   AND f.fecha_expedicion BETWEEN $1 AND $2
        GROUP BY u.id_usuario, u.nombres, u.apellidos, u.email
        ORDER BY "totalVendido" DESC`,
      [r.desde, r.hasta],
    );
    return { ...r, vendedores: aNumeros(filas, ['remisiones', 'totalVendido']) };
  }

  /** Estado de resultados del mes (P&G). */
  async getReporteEstadoResultados(periodo?: string) {
    const mes = periodo || fechaHoy().slice(0, 7);
    const res = await this.resultados(rangoMes(mes));
    const gastosPorCategoria = aNumeros(
      await this.dataSource.query(
        `SELECT cg.nombre AS categoria, cg.codigo_puc AS "codigoPuc", ROUND(SUM(g.monto), 2) AS total
           FROM gastos g JOIN categorias_gasto cg ON cg.id_categoria_gasto = g.id_categoria_gasto
          WHERE g.anulado = false AND g.fecha BETWEEN $1 AND $2
          GROUP BY cg.nombre, cg.codigo_puc
          ORDER BY total DESC`,
        [res.desde, res.hasta],
      ),
      ['total'],
    );
    return {
      periodo: mes,
      ingresosOperacionales: res.ingresosTotales,
      costoDeVentas: res.costoMercanciaVendida,
      utilidadBruta: res.utilidadBruta,
      margenBrutoPct: res.margenBrutoPct,
      gastosOperacionales: { total: res.gastosOperativos, porCategoria: gastosPorCategoria },
      utilidadOperacional: res.utilidadOperativa,
    };
  }

  async getReporteInventarioValorizado() {
    return this.inventario.getInventarioValorizado();
  }

  // ─── Cierres y periodos contables ──────────────────────────────────────────

  /**
   * Cierra un mes ya terminado: calcula sus totales y bloquea nuevos
   * documentos con fecha en ese mes. Transaccional y auditado.
   */
  async ejecutarCierreMensual(dto: CierreMensualDto, actor: Actor) {
    const mesActual = fechaHoy().slice(0, 7);
    if (dto.periodo >= mesActual) {
      throw new UnprocessableEntityException(`Solo se cierran meses terminados (anteriores a ${mesActual})`);
    }
    const [anio, mes] = dto.periodo.split('-').map(Number);

    return this.dataSource.transaction(async (manager) => {
      // Espera a que terminen las transacciones que validaron el periodo abierto (FOR SHARE)
      const [existente] = await manager.query(
        `SELECT id_periodo, abierto FROM periodos_contables WHERE anio = $1 AND mes = $2 FOR UPDATE`,
        [anio, mes],
      );
      if (existente && !existente.abierto) {
        throw new ConflictException(`El periodo ${dto.periodo} ya está cerrado`);
      }

      const res = await this.resultados(rangoMes(dto.periodo), manager);
      const [cierre] = await manager.query(
        `INSERT INTO periodos_contables
           (anio, mes, abierto, fecha_cierre, id_usuario_cierre, total_ingresos, total_costos, total_gastos, utilidad_neta, observaciones)
         VALUES ($1, $2, false, now(), $3, $4, $5, $6, $7, $8)
         ON CONFLICT (anio, mes) DO UPDATE
           SET abierto = false, fecha_cierre = now(), id_usuario_cierre = EXCLUDED.id_usuario_cierre,
               total_ingresos = EXCLUDED.total_ingresos, total_costos = EXCLUDED.total_costos,
               total_gastos = EXCLUDED.total_gastos, utilidad_neta = EXCLUDED.utilidad_neta,
               observaciones = EXCLUDED.observaciones
         RETURNING *`,
        [anio, mes, actor.id, res.ingresosTotales, res.costoMercanciaVendida, res.gastosOperativos, res.utilidadOperativa, dto.observaciones || null],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CIERRE_MENSUAL',
          recurso: 'periodos_contables',
          idRecurso: cierre.id_periodo,
          valorAnterior: existente ? { abierto: true } : null,
          valorNuevo: { periodo: dto.periodo, ...res },
          motivo: dto.observaciones,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { mensaje: `Periodo ${dto.periodo} cerrado`, cierre };
    });
  }

  async getPeriodosContables() {
    return this.dataSource.query(`SELECT * FROM periodos_contables ORDER BY anio DESC, mes DESC`);
  }

  /** Vuelve a cerrar un periodo reabierto, recalculando sus totales. */
  async cerrarPeriodoContable(id: string, actor: Actor) {
    const [periodo] = await this.dataSource.query(`SELECT anio, mes, abierto FROM periodos_contables WHERE id_periodo = $1`, [id]);
    if (!periodo) throw new NotFoundException(`Periodo contable ${id} no encontrado`);
    if (!periodo.abierto) throw new ConflictException('El periodo ya está cerrado');
    return this.ejecutarCierreMensual(
      { periodo: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}` },
      actor,
    );
  }

  /** Reabrir exige motivo y queda auditado: permite corregir documentos del mes. */
  async reabrirPeriodoContable(id: string, motivo: string, actor: Actor) {
    return this.dataSource.transaction(async (manager) => {
      const [periodo] = await manager.query(
        `SELECT anio, mes, abierto FROM periodos_contables WHERE id_periodo = $1 FOR UPDATE`,
        [id],
      );
      if (!periodo) throw new NotFoundException(`Periodo contable ${id} no encontrado`);
      if (periodo.abierto) throw new ConflictException('El periodo ya está abierto');

      await manager.query(
        `UPDATE periodos_contables SET abierto = true, fecha_cierre = NULL, motivo_reapertura = $2 WHERE id_periodo = $1`,
        [id, motivo],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'REABRIR_PERIODO',
          recurso: 'periodos_contables',
          idRecurso: id,
          valorAnterior: { abierto: false },
          valorNuevo: { abierto: true },
          motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { mensaje: `Periodo ${periodo.anio}-${String(periodo.mes).padStart(2, '0')} reabierto` };
    });
  }

  // ─── Exportación asíncrona ─────────────────────────────────────────────────

  async exportarReporte(dto: ExportarReporteDto, actor: Actor) {
    const permiso = PERMISO_REPORTE[dto.tipo];
    if (!actor.permisos.includes(permiso)) {
      throw new ForbiddenException(`Exportar el reporte ${dto.tipo} requiere el permiso ${permiso}`);
    }
    const job = await this.jobs.encolar(JOB_EXPORTAR, { tipo: dto.tipo, parametros: dto.parametros || {} }, actor.id);
    return {
      jobId: job.id_job,
      estado: job.estado,
      urlEstado: `/api/v1/reportes/jobs/${job.id_job}`,
    };
  }

  async getJob(jobId: string, actor: Actor) {
    const job = await this.jobs.obtener(jobId, actor);
    return this.jobs.vista(job, `/api/v1/reportes/jobs/${jobId}/descargar`);
  }

  async descargarJob(jobId: string, actor: Actor) {
    const job = await this.jobs.obtener(jobId, actor);
    if (job.estado !== 'COMPLETADO' || !job.ruta_archivo) {
      throw new ConflictException(`La tarea está ${job.estado}; aún no hay archivo para descargar`);
    }
    const extension = job.ruta_archivo.split('.').pop() || 'csv';
    return {
      contenido: await this.almacenamiento.leer(job.ruta_archivo),
      nombre: `${job.tipo.toLowerCase()}_${String(job.creado_en instanceof Date ? job.creado_en.toISOString() : job.creado_en).slice(0, 10)}.${extension}`,
      tipoMime: extension === 'pdf' ? 'application/pdf' : 'text/csv',
    };
  }

  /** Convierte cada reporte en filas planas para CSV. */
  private async filasReporte(tipo: TipoReporte, p: ParametrosReporteDto): Promise<Array<Record<string, unknown>>> {
    switch (tipo) {
      case 'ventas':
        return (await this.getReporteVentas(p.desde, p.hasta)).ventasPorDia;
      case 'inventario':
        return (await this.getReporteInventario()).items;
      case 'cartera':
        return (await this.getReporteCartera()).clientes;
      case 'compras':
        return (await this.getReporteCompras(p.desde, p.hasta)).compras;
      case 'gastos':
        return (await this.getReporteGastos(p.desde, p.hasta)).gastos;
      case 'utilidad':
        return [await this.getReporteUtilidad(p.desde, p.hasta)];
      case 'rentabilidad':
        return (await this.getReporteRentabilidad(p.desde, p.hasta)).productos;
      case 'flujo-caja':
        return [await this.getReporteFlujoCaja(p.desde, p.hasta)];
      case 'ventas-por-vendedor':
        return (await this.getReporteVentasPorVendedor(p.desde, p.hasta)).vendedores;
      case 'estado-resultados': {
        const er = await this.getReporteEstadoResultados(p.periodo);
        return [
          { concepto: 'Ingresos operacionales', valor: er.ingresosOperacionales },
          { concepto: 'Costo de ventas', valor: -er.costoDeVentas },
          { concepto: 'Utilidad bruta', valor: er.utilidadBruta },
          ...er.gastosOperacionales.porCategoria.map((g: any) => ({ concepto: `Gasto: ${g.categoria}`, valor: -g.total })),
          { concepto: 'Utilidad operacional', valor: er.utilidadOperacional },
        ];
      }
      case 'inventario-valorizado':
        return (await this.getReporteInventarioValorizado()).items;
    }
  }
}
