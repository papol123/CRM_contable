import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { FacturasVentaService } from '../ventas/facturas-venta.service';
import { GastosService } from '../financiero/gastos.service';
import { ComprasService } from '../financiero/compras.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';
import { PERMISOS_GLOBALES } from '../../common/autorizacion/propiedad';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado, Paginado } from '../../common/paginacion/paginacion';
import { redondear } from '../../common/documentos/totales';
import { fechaHoy } from '../../common/utils/fechas';
import {
  CompraManualDto,
  ConsultaCierresDiariosDto,
  GastoManualDto,
  GuardarCierreDiarioDto,
  RemisionManualDto,
} from './dto/cierre-diario.dto';

export interface RemisionDia {
  id: string;
  numero: string;
  cliente: string;
  total: number;
  saldo: number;
  /** Cobrada según el sistema (saldo en cero). */
  pagadaSistema: boolean;
  /** Cobrada para el arqueo (sistema o ajuste manual guardado). */
  pagada: boolean;
}

export interface GastoDia {
  id: string;
  concepto: string;
  categoria: string;
  monto: number;
  medioPago: string;
}

export interface CompraDia {
  id: string;
  proveedor: string;
  numeroFactura: string;
  monto: number;
  saldo: number;
  pagada: boolean;
}

export interface CuadreDiario {
  totalVentas: number;
  ventasCobradas: number;
  ventasCredito: number;
  totalGastos: number;
  totalComprasPagadas: number;
  saldoEsperado: number;
  diferencia: number;
}

/**
 * Cuadre de caja del día:
 *   saldo esperado = ventas cobradas + facturado día anterior − gastos − compras pagadas
 *   diferencia     = efectivo contado − saldo esperado
 */
export function calcularCuadre(entrada: {
  remisiones: { total: number; pagada: boolean }[];
  gastos: { monto: number }[];
  compras: { monto: number; pagada: boolean }[];
  facturadoDiaAnterior: number;
  efectivoReal: number;
}): CuadreDiario {
  const suma = (valores: number[]) => valores.reduce((acc, v) => acc + Number(v || 0), 0);
  const totalVentas = suma(entrada.remisiones.map((r) => r.total));
  const ventasCobradas = suma(entrada.remisiones.filter((r) => r.pagada).map((r) => r.total));
  const totalGastos = suma(entrada.gastos.map((g) => g.monto));
  const totalComprasPagadas = suma(entrada.compras.filter((c) => c.pagada).map((c) => c.monto));
  const saldoEsperado = ventasCobradas + Number(entrada.facturadoDiaAnterior || 0) - totalGastos - totalComprasPagadas;
  return {
    totalVentas: redondear(totalVentas),
    ventasCobradas: redondear(ventasCobradas),
    ventasCredito: redondear(totalVentas - ventasCobradas),
    totalGastos: redondear(totalGastos),
    totalComprasPagadas: redondear(totalComprasPagadas),
    saldoEsperado: redondear(saldoEsperado),
    diferencia: redondear(Number(entrada.efectivoReal || 0) - saldoEsperado),
  };
}

/** Recorre todas las páginas de un listado paginado (máx. 100 por página). */
async function todasLasPaginas<T>(consulta: (page: number) => Promise<Paginado<T>>): Promise<T[]> {
  const filas: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await consulta(page);
    filas.push(...res.data);
    if (page >= res.meta.totalPages) break;
  }
  return filas;
}

const COLUMNAS_CIERRE = `
  c.id_cierre_diario, to_char(c.fecha, 'YYYY-MM-DD') AS fecha, c.facturado_dia_anterior, c.total_ventas,
  c.ventas_cobradas, c.ventas_credito, c.total_gastos, c.total_compras_pagadas, c.saldo_esperado,
  c.efectivo_real, c.diferencia, c.observaciones, c.detalle, c.id_usuario_cierre, c.creado_en,
  c.actualizado_en, u.email AS cerrado_por_email,
  NULLIF(TRIM(COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '')), '') AS cerrado_por_nombre`;

function mapearCierre(fila: any) {
  if (!fila) return null;
  const num = (v: unknown) => Number(v ?? 0);
  return {
    id: fila.id_cierre_diario,
    fecha: fila.fecha,
    facturadoDiaAnterior: num(fila.facturado_dia_anterior),
    totalVentas: num(fila.total_ventas),
    ventasCobradas: num(fila.ventas_cobradas),
    ventasCredito: num(fila.ventas_credito),
    totalGastos: num(fila.total_gastos),
    totalComprasPagadas: num(fila.total_compras_pagadas),
    saldoEsperado: num(fila.saldo_esperado),
    efectivoReal: num(fila.efectivo_real),
    diferencia: num(fila.diferencia),
    observaciones: fila.observaciones || '',
    detalle: fila.detalle || {},
    cerradoPor: fila.id_usuario_cierre
      ? { id: fila.id_usuario_cierre, email: fila.cerrado_por_email, nombre: fila.cerrado_por_nombre }
      : null,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/**
 * Cierre diario y arqueo de caja. Consolida las ventas, gastos y compras del
 * día de TODOS los usuarios (es una vista global reservada a cierres.ejecutar),
 * más los ítems que se agregan a mano en el arqueo. Los totales se recalculan
 * siempre en el servidor: lo que envía el navegador son solo los insumos.
 */
@Injectable()
export class CierreDiarioService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly facturasVenta: FacturasVentaService,
    private readonly gastos: GastosService,
    private readonly compras: ComprasService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** El cierre de caja abarca a todos los usuarios: se consulta con alcance global. */
  private actorGlobal(actor: Actor): Actor {
    const globales = [PERMISOS_GLOBALES.ventas, PERMISOS_GLOBALES.compras, 'gastos.consultar_todos'];
    return { ...actor, permisos: Array.from(new Set([...actor.permisos, ...globales])) };
  }

  private async datosDelSistema(fecha: string, actor: Actor) {
    const global = this.actorGlobal(actor);
    const filtroDia = { desde: fecha, hasta: fecha, limit: 100 };

    const [ventas, gastos, compras] = await Promise.all([
      todasLasPaginas<any>((page) =>
        this.facturasVenta.findAllFacturas({ ...filtroDia, page, anulada: false }, global),
      ),
      todasLasPaginas<any>((page) => this.gastos.findAll(global, { ...filtroDia, page })),
      todasLasPaginas<any>((page) => this.compras.findAll({ ...filtroDia, page }, global)),
    ]);

    const remisiones: RemisionDia[] = ventas.map((f) => {
      const saldo = Number(f.saldo || 0);
      const pagada = f.estado?.codigo === 'PAGADA' || saldo <= 0;
      return {
        id: f.id,
        // Remisión rápida: se identifica por el número de la factura física
        numero: f.numeroExterno ? `N° ${f.numeroExterno} (${f.numeroVenta})` : f.numeroVenta,
        cliente: [f.cliente?.tercero?.razonSocial || 'Cliente General', f.nombreDeudor].filter(Boolean).join(' · '),
        total: Number(f.total || 0),
        saldo,
        pagadaSistema: pagada,
        pagada,
      };
    });

    const gastosDia: GastoDia[] = gastos.map((g) => ({
      id: g.id,
      concepto: g.descripcion,
      categoria: g.categoria?.nombre || 'Sin categoría',
      monto: Number(g.monto || 0),
      medioPago: g.metodoPago?.nombre || 'EFECTIVO',
    }));

    const comprasDia: CompraDia[] = compras
      .filter((c) => c.estado?.codigo !== 'ANULADA')
      .map((c) => {
        const saldo = Number(c.saldo || 0);
        return {
          id: c.id,
          proveedor: c.proveedor?.tercero?.razonSocial || 'Proveedor',
          numeroFactura: c.numeroFactura || 'Sin número',
          monto: Number(c.total || 0),
          saldo,
          pagada: c.estado?.codigo === 'PAGADA' || saldo <= 0,
        };
      });

    return { remisiones, gastos: gastosDia, compras: comprasDia };
  }

  private async buscarPorFecha(fecha: string) {
    const [fila] = await this.dataSource.query(
      `SELECT ${COLUMNAS_CIERRE}
         FROM cierres_diarios c
         LEFT JOIN usuarios u ON u.id_usuario = c.id_usuario_cierre
        WHERE c.fecha = $1`,
      [fecha],
    );
    return mapearCierre(fila);
  }

  /** Ventas, gastos y compras del día + el cierre guardado (si existe) con su cuadre. */
  async resumen(fecha: string, actor: Actor) {
    const [sistema, cierre] = await Promise.all([this.datosDelSistema(fecha, actor), this.buscarPorFecha(fecha)]);

    // Aplica los ajustes de cobro guardados sobre las remisiones del sistema
    const ajustes = new Map<string, boolean>(
      (cierre?.detalle?.ajustesRemisiones || []).map((a: any) => [a.idFactura, a.pagada]),
    );
    const remisiones = sistema.remisiones.map((r) => (ajustes.has(r.id) ? { ...r, pagada: ajustes.get(r.id)! } : r));

    const manuales = {
      remisiones: (cierre?.detalle?.remisionesManuales || []) as RemisionManualDto[],
      gastos: (cierre?.detalle?.gastosManuales || []) as GastoManualDto[],
      compras: (cierre?.detalle?.comprasManuales || []) as CompraManualDto[],
    };

    const cuadre = calcularCuadre({
      remisiones: [...remisiones, ...manuales.remisiones],
      gastos: [...sistema.gastos, ...manuales.gastos],
      compras: [...sistema.compras, ...manuales.compras],
      facturadoDiaAnterior: cierre?.facturadoDiaAnterior || 0,
      efectivoReal: cierre?.efectivoReal || 0,
    });

    return {
      fecha,
      remisiones,
      gastos: sistema.gastos,
      compras: sistema.compras,
      manuales,
      cuadre,
      cierre,
    };
  }

  /** Crea o reemplaza el cierre del día. Transaccional y auditado. */
  async guardar(fecha: string, dto: GuardarCierreDiarioDto, actor: Actor) {
    if (fecha > fechaHoy()) {
      throw new UnprocessableEntityException('No se puede registrar el cierre de un día que aún no llega');
    }

    const sistema = await this.datosDelSistema(fecha, actor);
    const idsSistema = new Set(sistema.remisiones.map((r) => r.id));
    // Solo se guardan ajustes de remisiones de ese día que difieren del sistema
    const ajustesRemisiones = (dto.ajustesRemisiones || []).filter((a) => {
      const r = sistema.remisiones.find((x) => x.id === a.idFactura);
      return idsSistema.has(a.idFactura) && r && r.pagadaSistema !== a.pagada;
    });
    const ajustes = new Map(ajustesRemisiones.map((a) => [a.idFactura, a.pagada]));
    const remisiones = sistema.remisiones.map((r) => ({ ...r, pagada: ajustes.get(r.id) ?? r.pagada }));

    const conId = <T extends { id?: string }>(items: T[] = []) => items.map((i) => ({ ...i, id: i.id || randomUUID() }));
    const detalle = {
      ajustesRemisiones,
      remisionesManuales: conId(dto.remisionesManuales),
      gastosManuales: conId(dto.gastosManuales),
      comprasManuales: conId(dto.comprasManuales),
      sistema: {
        remisiones: sistema.remisiones.length,
        gastos: sistema.gastos.length,
        compras: sistema.compras.length,
      },
    };

    const cuadre = calcularCuadre({
      remisiones: [...remisiones, ...detalle.remisionesManuales],
      gastos: [...sistema.gastos, ...detalle.gastosManuales],
      compras: [...sistema.compras, ...detalle.comprasManuales],
      facturadoDiaAnterior: dto.facturadoDiaAnterior,
      efectivoReal: dto.efectivoReal,
    });

    const id = await this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fecha, 'registrar el cierre diario');

      const [anterior] = await manager.query(
        `SELECT id_cierre_diario, saldo_esperado, efectivo_real, diferencia
           FROM cierres_diarios WHERE fecha = $1 FOR UPDATE`,
        [fecha],
      );

      const [fila] = await manager.query(
        `INSERT INTO cierres_diarios
           (fecha, facturado_dia_anterior, total_ventas, ventas_cobradas, ventas_credito, total_gastos,
            total_compras_pagadas, saldo_esperado, efectivo_real, diferencia, observaciones, detalle, id_usuario_cierre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (fecha) DO UPDATE SET
           facturado_dia_anterior = EXCLUDED.facturado_dia_anterior,
           total_ventas = EXCLUDED.total_ventas,
           ventas_cobradas = EXCLUDED.ventas_cobradas,
           ventas_credito = EXCLUDED.ventas_credito,
           total_gastos = EXCLUDED.total_gastos,
           total_compras_pagadas = EXCLUDED.total_compras_pagadas,
           saldo_esperado = EXCLUDED.saldo_esperado,
           efectivo_real = EXCLUDED.efectivo_real,
           diferencia = EXCLUDED.diferencia,
           observaciones = EXCLUDED.observaciones,
           detalle = EXCLUDED.detalle,
           id_usuario_cierre = EXCLUDED.id_usuario_cierre,
           actualizado_en = now()
         RETURNING id_cierre_diario`,
        [
          fecha,
          dto.facturadoDiaAnterior,
          cuadre.totalVentas,
          cuadre.ventasCobradas,
          cuadre.ventasCredito,
          cuadre.totalGastos,
          cuadre.totalComprasPagadas,
          cuadre.saldoEsperado,
          dto.efectivoReal,
          cuadre.diferencia,
          dto.observaciones?.trim() || null,
          JSON.stringify(detalle),
          actor.id,
        ],
      );

      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: anterior ? 'ACTUALIZAR_CIERRE_DIARIO' : 'CIERRE_DIARIO',
          recurso: 'cierres_diarios',
          idRecurso: fila.id_cierre_diario,
          valorAnterior: anterior
            ? {
                saldoEsperado: Number(anterior.saldo_esperado),
                efectivoReal: Number(anterior.efectivo_real),
                diferencia: Number(anterior.diferencia),
              }
            : null,
          valorNuevo: { fecha, ...cuadre, efectivoReal: dto.efectivoReal },
          motivo: dto.observaciones,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return fila.id_cierre_diario as string;
    });

    return { mensaje: `Cierre del ${fecha} guardado`, id, cierre: await this.buscarPorFecha(fecha) };
  }

  /** Historial de cierres diarios, del más reciente al más antiguo. */
  async listar(filtros: ConsultaCierresDiariosDto) {
    const pagina = normalizarPaginacion(filtros);
    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (filtros.desde) {
      params.push(filtros.desde.slice(0, 10));
      condiciones.push(`c.fecha >= $${params.length}`);
    }
    if (filtros.hasta) {
      params.push(filtros.hasta.slice(0, 10));
      condiciones.push(`c.fecha <= $${params.length}`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [{ total }] = await this.dataSource.query(`SELECT COUNT(*)::int AS total FROM cierres_diarios c ${where}`, params);
    const filas = await this.dataSource.query(
      `SELECT ${COLUMNAS_CIERRE}
         FROM cierres_diarios c
         LEFT JOIN usuarios u ON u.id_usuario = c.id_usuario_cierre
         ${where}
        ORDER BY c.fecha DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pagina.limit, pagina.offset],
    );
    // El historial no necesita el detalle de ítems manuales
    const data = filas.map((f: any) => {
      const { detalle, ...resto } = mapearCierre(f)!;
      return resto;
    });
    return paginado(data, total, pagina);
  }
}
