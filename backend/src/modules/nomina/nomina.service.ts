import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { redondear } from '../../common/documentos/totales';
import { fechaHoy, rangoMes } from '../../common/utils/fechas';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { PdfService } from '../../common/pdf/pdf.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';
import {
  AbrirPeriodoNominaDto,
  CalcularNominaDto,
  ConsultaEmpleadosDto,
  CreateEmpleadoDto,
  PagarNominaDto,
  UpdateEmpleadoDto,
} from './nomina.dto';

interface ParametrosNomina {
  smmlv: number;
  auxilioTransporte: number;
  topeAuxilioSmmlv: number;
  pctSalud: number;
  pctPension: number;
}

export interface LiquidacionEmpleado {
  salarioDevengado: number;
  auxilioTransporte: number;
  deduccionSalud: number;
  deduccionPension: number;
  neto: number;
}

/**
 * Liquidación mensual de un empleado. El salario y el auxilio de transporte
 * se pagan en proporción a los días trabajados (base 30). Salud y pensión se
 * descuentan sobre lo devengado sin auxilio. Los parámetros se administran en
 * configuracion_sistema (NOMINA_*).
 */
export function liquidarEmpleado(
  salarioBase: number,
  novedad: { diasTrabajados: number; horasExtras: number; bonificaciones: number; otrasDeducciones: number },
  p: ParametrosNomina,
): LiquidacionEmpleado {
  const proporcion = Math.min(30, Math.max(0, novedad.diasTrabajados)) / 30;
  const salarioDevengado = redondear(salarioBase * proporcion);
  const tieneAuxilio = salarioBase <= p.topeAuxilioSmmlv * p.smmlv;
  const auxilioTransporte = tieneAuxilio ? redondear(p.auxilioTransporte * proporcion) : 0;
  const baseAportes = salarioDevengado + novedad.horasExtras + novedad.bonificaciones;
  const deduccionSalud = redondear(baseAportes * (p.pctSalud / 100));
  const deduccionPension = redondear(baseAportes * (p.pctPension / 100));
  const neto = redondear(
    salarioDevengado + auxilioTransporte + novedad.horasExtras + novedad.bonificaciones -
      deduccionSalud - deduccionPension - novedad.otrasDeducciones,
  );
  return { salarioDevengado, auxilioTransporte, deduccionSalud, deduccionPension, neto };
}

@Injectable()
export class NominaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pdf: PdfService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async parametros(db: EntityManager): Promise<ParametrosNomina> {
    const filas: Array<{ clave: string; valor: string }> = await db.query(
      `SELECT clave, valor FROM configuracion_sistema WHERE categoria = 'NOMINA'`,
    );
    const v = Object.fromEntries(filas.map((f) => [f.clave, Number(f.valor)]));
    if (!v.NOMINA_SMMLV) {
      throw new UnprocessableEntityException('Configure NOMINA_SMMLV y demás parámetros de nómina en /configuracion');
    }
    return {
      smmlv: v.NOMINA_SMMLV,
      auxilioTransporte: v.NOMINA_AUXILIO_TRANSPORTE || 0,
      topeAuxilioSmmlv: v.NOMINA_TOPE_AUXILIO_SMMLV || 2,
      pctSalud: v.NOMINA_PCT_SALUD ?? 4,
      pctPension: v.NOMINA_PCT_PENSION ?? 4,
    };
  }

  // ─── Empleados ─────────────────────────────────────────────────────────────

  async findAllEmpleados(filtros: ConsultaEmpleadosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const params: any[] = [];
    const condiciones: string[] = [];
    if (filtros.search?.trim()) {
      params.push(`%${filtros.search.trim().toLowerCase()}%`);
      condiciones.push(`(LOWER(t.razon_social) LIKE $${params.length} OR t.numero_documento LIKE $${params.length} OR LOWER(e.cargo) LIKE $${params.length})`);
    }
    if (filtros.activo) {
      params.push(filtros.activo === 'true');
      condiciones.push(`e.activo = $${params.length}`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM empleados e LEFT JOIN terceros t ON t.id_tercero = e.id_tercero ${where}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT e.id_empleado AS id, e.id_tercero AS "idTercero", t.numero_documento AS "numeroDocumento",
              t.razon_social AS "nombreCompleto", e.cargo, e.salario_base AS "salarioBase",
              e.fecha_ingreso AS "fechaIngreso", e.tipo_contrato AS "tipoContrato", e.activo, e.creado_en AS "creadoEn"
         FROM empleados e LEFT JOIN terceros t ON t.id_tercero = e.id_tercero
         ${where}
        ORDER BY t.razon_social
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pagina.limit, pagina.offset],
    );
    return paginado(data.map((e: any) => ({ ...e, salarioBase: Number(e.salarioBase) })), total, pagina);
  }

  async findEmpleadoById(id: string, db: EntityManager = this.dataSource.manager) {
    const [empleado] = await db.query(
      `SELECT e.id_empleado AS id, e.id_tercero AS "idTercero", t.numero_documento AS "numeroDocumento",
              t.razon_social AS "nombreCompleto", e.cargo, e.salario_base AS "salarioBase",
              e.fecha_ingreso AS "fechaIngreso", e.tipo_contrato AS "tipoContrato", e.activo, e.creado_en AS "creadoEn"
         FROM empleados e LEFT JOIN terceros t ON t.id_tercero = e.id_tercero
        WHERE e.id_empleado = $1`,
      [id],
    );
    if (!empleado) throw new NotFoundException(`Empleado con ID ${id} no encontrado`);
    return { ...empleado, salarioBase: Number(empleado.salarioBase) };
  }

  async createEmpleado(dto: CreateEmpleadoDto, actor: Actor) {
    const id = await this.dataSource.transaction(async (manager) => {
      let idTercero = dto.idTercero;
      if (idTercero) {
        const [t] = await manager.query(`SELECT 1 FROM terceros WHERE id_tercero = $1`, [idTercero]);
        if (!t) throw new NotFoundException(`Tercero ${idTercero} no encontrado`);
      } else {
        const documento = dto.numeroDocumento!.trim();
        const [existente] = await manager.query(`SELECT id_tercero FROM terceros WHERE numero_documento = $1`, [documento]);
        if (existente) {
          idTercero = existente.id_tercero;
        } else {
          const [nuevo] = await manager.query(
            `INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, activo)
             VALUES ($1, $2, $3, 'NATURAL', true) RETURNING id_tercero`,
            [dto.idTipoDocumento, documento, dto.nombreCompleto!.trim()],
          );
          idTercero = nuevo.id_tercero;
        }
      }
      const [yaEmpleado] = await manager.query(`SELECT 1 FROM empleados WHERE id_tercero = $1 AND activo`, [idTercero]);
      if (yaEmpleado) throw new ConflictException('Esa persona ya está registrada como empleado activo');

      const [empleado] = await manager.query(
        `INSERT INTO empleados (id_tercero, cargo, salario_base, fecha_ingreso, tipo_contrato)
         VALUES ($1, $2, $3, $4, $5) RETURNING id_empleado`,
        [idTercero, dto.cargo.trim(), dto.salarioBase, dto.fechaIngreso.slice(0, 10), dto.tipoContrato || 'TERMINO_INDEFINIDO'],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CREAR',
          recurso: 'empleados',
          idRecurso: empleado.id_empleado,
          valorNuevo: { ...dto, idTercero },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return empleado.id_empleado as string;
    });
    return this.findEmpleadoById(id);
  }

  async updateEmpleado(id: string, dto: UpdateEmpleadoDto, actor: Actor) {
    const anterior = await this.findEmpleadoById(id);
    const campos: string[] = [];
    const params: any[] = [];
    const columnas: Record<string, unknown> = {
      cargo: dto.cargo?.trim(),
      salario_base: dto.salarioBase,
      tipo_contrato: dto.tipoContrato,
      activo: dto.activo,
    };
    for (const [columna, valor] of Object.entries(columnas)) {
      if (valor === undefined) continue;
      params.push(valor);
      campos.push(`${columna} = $${params.length}`);
    }
    if (!campos.length) return anterior;

    await this.dataSource.transaction(async (manager) => {
      params.push(id);
      await manager.query(`UPDATE empleados SET ${campos.join(', ')} WHERE id_empleado = $${params.length}`, params);
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ACTUALIZAR',
          recurso: 'empleados',
          idRecurso: id,
          valorAnterior: { cargo: anterior.cargo, salarioBase: anterior.salarioBase, tipoContrato: anterior.tipoContrato, activo: anterior.activo },
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.findEmpleadoById(id);
  }

  // ─── Periodos de nómina ────────────────────────────────────────────────────

  async findAllPeriodosNomina() {
    const filas = await this.dataSource.query(`SELECT * FROM periodos_nomina ORDER BY anio DESC, mes DESC`);
    return filas.map((p: any) => this.formatoPeriodo(p));
  }

  private formatoPeriodo(p: any) {
    return {
      id: p.id_periodo_nomina,
      mes: p.mes,
      anio: p.anio,
      fechaInicio: p.fecha_inicio,
      fechaFin: p.fecha_fin,
      estado: p.estado,
      totalDevengado: Number(p.total_devengado || 0),
      totalDeducciones: Number(p.total_deducciones || 0),
      totalNeto: Number(p.total_neto || 0),
      idGasto: p.id_gasto,
      creadoEn: p.creado_en,
    };
  }

  async findPeriodoNominaById(id: string, db: EntityManager = this.dataSource.manager) {
    const [periodo] = await db.query(`SELECT * FROM periodos_nomina WHERE id_periodo_nomina = $1`, [id]);
    if (!periodo) throw new NotFoundException(`Periodo de nómina con ID ${id} no encontrado`);

    const detalles = await db.query(
      `SELECT dn.id_detalle_nomina AS id, dn.id_empleado AS "idEmpleado", t.razon_social AS empleado,
              t.numero_documento AS documento, e.cargo, dn.dias_trabajados AS "diasTrabajados",
              dn.salario_base AS "salarioBase", dn.auxilio_transporte AS "auxilioTransporte",
              dn.horas_extras AS "horasExtras", dn.bonificaciones, dn.deduccion_salud AS "deduccionSalud",
              dn.deduccion_pension AS "deduccionPension", dn.otras_deducciones AS "otrasDeducciones",
              dn.neto_pagar AS "netoPagar"
         FROM detalle_nomina dn
         JOIN empleados e ON e.id_empleado = dn.id_empleado
         LEFT JOIN terceros t ON t.id_tercero = e.id_tercero
        WHERE dn.id_periodo_nomina = $1
        ORDER BY t.razon_social`,
      [id],
    );
    const numericos = ['salarioBase', 'auxilioTransporte', 'horasExtras', 'bonificaciones', 'deduccionSalud', 'deduccionPension', 'otrasDeducciones', 'netoPagar'];
    return {
      ...this.formatoPeriodo(periodo),
      detalles: detalles.map((d: any) => {
        for (const c of numericos) d[c] = Number(d[c] || 0);
        return d;
      }),
    };
  }

  /** Abre el periodo (uno por mes) con los empleados activos y lo liquida. */
  async abrirPeriodo(dto: AbrirPeriodoNominaDto, actor: Actor) {
    const mes = `${dto.anio}-${String(dto.mes).padStart(2, '0')}`;
    const rangoDelMes = rangoMes(mes);
    const fechaInicio = dto.fechaInicio?.slice(0, 10) || rangoDelMes.desde;
    const fechaFin = dto.fechaFin?.slice(0, 10) || rangoDelMes.hasta;
    if (fechaFin < fechaInicio) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');

    const id = await this.dataSource.transaction(async (manager) => {
      const [existe] = await manager.query(`SELECT 1 FROM periodos_nomina WHERE anio = $1 AND mes = $2`, [dto.anio, dto.mes]);
      if (existe) throw new ConflictException(`Ya existe la nómina de ${mes}`);

      const [periodo] = await manager.query(
        `INSERT INTO periodos_nomina (mes, anio, fecha_inicio, fecha_fin, estado)
         VALUES ($1, $2, $3, $4, 'ABIERTO') RETURNING id_periodo_nomina`,
        [dto.mes, dto.anio, fechaInicio, fechaFin],
      );
      const empleados = await manager.query(
        `SELECT id_empleado, salario_base FROM empleados WHERE activo AND fecha_ingreso <= $1`,
        [fechaFin],
      );
      for (const emp of empleados) {
        await manager.query(
          `INSERT INTO detalle_nomina (id_periodo_nomina, id_empleado, salario_base, dias_trabajados, neto_pagar)
           VALUES ($1, $2, $3, 30, 0)`,
          [periodo.id_periodo_nomina, emp.id_empleado, emp.salario_base],
        );
      }
      await this.liquidar(manager, periodo.id_periodo_nomina);
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ABRIR_NOMINA',
          recurso: 'periodos_nomina',
          idRecurso: periodo.id_periodo_nomina,
          valorNuevo: { periodo: mes, empleados: empleados.length },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return periodo.id_periodo_nomina as string;
    });
    return this.findPeriodoNominaById(id);
  }

  /** Aplica novedades (días, horas extras, bonificaciones, descuentos) y recalcula. */
  async calcularNomina(id: string, dto: CalcularNominaDto, actor: Actor) {
    await this.dataSource.transaction(async (manager) => {
      const [periodo] = await manager.query(
        `SELECT estado FROM periodos_nomina WHERE id_periodo_nomina = $1 FOR UPDATE`,
        [id],
      );
      if (!periodo) throw new NotFoundException(`Periodo de nómina con ID ${id} no encontrado`);
      if (periodo.estado === 'PAGADO' || periodo.estado === 'CERRADO') {
        throw new ConflictException(`No se recalcula un periodo ${periodo.estado}`);
      }

      for (const n of dto.novedades || []) {
        const [detalle] = await manager.query(
          `SELECT 1 FROM detalle_nomina WHERE id_periodo_nomina = $1 AND id_empleado = $2`,
          [id, n.idEmpleado],
        );
        if (!detalle) throw new NotFoundException(`El empleado ${n.idEmpleado} no está en esta nómina`);
        await manager.query(
          `UPDATE detalle_nomina
              SET dias_trabajados = COALESCE($3, dias_trabajados),
                  horas_extras = COALESCE($4, horas_extras),
                  bonificaciones = COALESCE($5, bonificaciones),
                  otras_deducciones = COALESCE($6, otras_deducciones)
            WHERE id_periodo_nomina = $1 AND id_empleado = $2`,
          [id, n.idEmpleado, n.diasTrabajados ?? null, n.horasExtras ?? null, n.bonificaciones ?? null, n.otrasDeducciones ?? null],
        );
      }
      const totales = await this.liquidar(manager, id);
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CALCULAR_NOMINA',
          recurso: 'periodos_nomina',
          idRecurso: id,
          valorNuevo: { novedades: dto.novedades?.length || 0, ...totales },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.findPeriodoNominaById(id);
  }

  /** Liquida cada empleado del periodo con los parámetros vigentes y actualiza los totales. */
  private async liquidar(manager: EntityManager, idPeriodo: string) {
    const p = await this.parametros(manager);
    const detalles = await manager.query(
      `SELECT id_detalle_nomina, salario_base, dias_trabajados, horas_extras, bonificaciones, otras_deducciones
         FROM detalle_nomina WHERE id_periodo_nomina = $1`,
      [idPeriodo],
    );
    let devengado = 0;
    let deducciones = 0;
    let neto = 0;
    for (const d of detalles) {
      const novedad = {
        diasTrabajados: Number(d.dias_trabajados),
        horasExtras: Number(d.horas_extras || 0),
        bonificaciones: Number(d.bonificaciones || 0),
        otrasDeducciones: Number(d.otras_deducciones || 0),
      };
      const l = liquidarEmpleado(Number(d.salario_base), novedad, p);
      await manager.query(
        `UPDATE detalle_nomina
            SET auxilio_transporte = $2, deduccion_salud = $3, deduccion_pension = $4, neto_pagar = $5
          WHERE id_detalle_nomina = $1`,
        [d.id_detalle_nomina, l.auxilioTransporte, l.deduccionSalud, l.deduccionPension, l.neto],
      );
      devengado += l.salarioDevengado + l.auxilioTransporte + novedad.horasExtras + novedad.bonificaciones;
      deducciones += l.deduccionSalud + l.deduccionPension + novedad.otrasDeducciones;
      neto += l.neto;
    }
    const totales = { totalDevengado: redondear(devengado), totalDeducciones: redondear(deducciones), totalNeto: redondear(neto) };
    await manager.query(
      `UPDATE periodos_nomina
          SET total_devengado = $2, total_deducciones = $3, total_neto = $4, estado = 'CALCULADO'
        WHERE id_periodo_nomina = $1`,
      [idPeriodo, totales.totalDevengado, totales.totalDeducciones, totales.totalNeto],
    );
    return totales;
  }

  /** Marca la nómina como pagada y registra el gasto de nómina en la misma transacción. */
  async pagarNomina(id: string, dto: PagarNominaDto, actor: Actor) {
    const fechaPago = dto.fechaPago?.slice(0, 10) || fechaHoy();
    return this.dataSource.transaction(async (manager) => {
      const [periodo] = await manager.query(
        `SELECT * FROM periodos_nomina WHERE id_periodo_nomina = $1 FOR UPDATE`,
        [id],
      );
      if (!periodo) throw new NotFoundException(`Periodo de nómina con ID ${id} no encontrado`);
      if (periodo.estado === 'PAGADO') throw new ConflictException('La nómina ya fue pagada');
      if (periodo.estado !== 'CALCULADO') {
        throw new ConflictException('Calcule la nómina antes de pagarla');
      }
      if (Number(periodo.total_neto) <= 0) throw new UnprocessableEntityException('La nómina no tiene valor a pagar');
      await validarPeriodoAbierto(manager, fechaPago, 'registrar el pago de nómina');

      let [cat] = await manager.query(
        `SELECT id_categoria_gasto FROM categorias_gasto WHERE codigo_puc = '5105' OR nombre ILIKE '%nómina%' OR nombre ILIKE '%nomina%' LIMIT 1`,
      );
      if (!cat) {
        [cat] = await manager.query(
          `INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ('Nómina y Salarios', '5105') RETURNING id_categoria_gasto`,
        );
      }

      const periodoTexto = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
      const [gasto] = await manager.query(
        `INSERT INTO gastos (id_categoria_gasto, id_metodo_pago, descripcion, monto, fecha, id_usuario, anulado)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         RETURNING id_gasto`,
        [cat.id_categoria_gasto, dto.idMetodoPago || null, `Pago de nómina ${periodoTexto}`, periodo.total_neto, fechaPago, actor.id],
      );
      await manager.query(
        `UPDATE periodos_nomina SET estado = 'PAGADO', id_gasto = $2 WHERE id_periodo_nomina = $1`,
        [id, gasto.id_gasto],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'PAGAR_NOMINA',
          recurso: 'periodos_nomina',
          idRecurso: id,
          valorAnterior: { estado: periodo.estado },
          valorNuevo: { estado: 'PAGADO', idGasto: gasto.id_gasto, monto: Number(periodo.total_neto) },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { mensaje: `Nómina ${periodoTexto} pagada. Se registró el gasto`, idGasto: gasto.id_gasto };
    });
  }

  async getDesprendibles(id: string): Promise<{ contenido: Buffer; nombre: string }> {
    const periodo = await this.findPeriodoNominaById(id);
    if (periodo.estado === 'ABIERTO') throw new ConflictException('Calcule la nómina antes de generar los desprendibles');
    const periodoTexto = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
    const contenido = await this.pdf.desprendibles(
      periodoTexto,
      periodo.detalles.map((d: any) => {
        const salarioDevengado = redondear((d.salarioBase * d.diasTrabajados) / 30);
        return {
          empleado: d.empleado ?? 'Sin nombre',
          documento: d.documento,
          cargo: d.cargo,
          diasTrabajados: d.diasTrabajados,
          devengados: [
            ['Salario', salarioDevengado],
            ['Auxilio de transporte', d.auxilioTransporte],
            ['Horas extras y recargos', d.horasExtras],
            ['Bonificaciones', d.bonificaciones],
          ].filter(([, v]) => Number(v) > 0) as Array<[string, number]>,
          deducciones: [
            ['Salud', d.deduccionSalud],
            ['Pensión', d.deduccionPension],
            ['Otras deducciones', d.otrasDeducciones],
          ].filter(([, v]) => Number(v) > 0) as Array<[string, number]>,
          neto: d.netoPagar,
        };
      }),
    );
    return { contenido, nombre: `desprendibles_${periodoTexto}.pdf` };
  }
}
