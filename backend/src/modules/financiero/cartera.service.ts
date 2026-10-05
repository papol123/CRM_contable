import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JobsService } from '../../common/jobs/jobs.service';
import { CorreoService } from '../../common/correo/correo.service';
import { formatoMoneda } from '../../common/pdf/pdf.service';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';
import {
  consultarSaldosCompra,
  consultarSaldosVenta,
  SaldoFacturaVenta,
} from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';

const JOB_RECORDATORIOS = 'RECORDATORIOS_CARTERA';

@Injectable()
export class CarteraService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jobs: JobsService,
    private readonly correo: CorreoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  onModuleInit() {
    this.jobs.registrar(JOB_RECORDATORIOS, (job) => this.procesarRecordatorios(job.parametros || {}));
  }

  private get db() {
    return this.dataSource.manager;
  }

  private conEstado<T extends { diasMora: number }>(fila: T) {
    return { ...fila, estadoCartera: fila.diasMora > 0 ? 'VENCIDA' : 'AL_DIA' };
  }

  // ─── Cuentas por cobrar ────────────────────────────────────────────────────

  async getCuentasPorCobrar(idCliente?: string) {
    const filas = await consultarSaldosVenta(this.db, { soloConSaldo: true, idContraparte: idCliente });
    return filas.map((f) => this.conEstado(f));
  }

  async getCuentaPorCobrar(id: string) {
    const [fila] = await consultarSaldosVenta(this.db, { id, incluirCastigadas: true });
    if (!fila) throw new NotFoundException(`Cuenta por cobrar ${id} no encontrada (o la factura está anulada)`);
    const pagos = await this.db.query(
      `SELECT p.id_pago AS "idPago", p.fecha_pago AS "fechaPago", a.monto_aplicado AS "montoAplicado",
              ep.codigo AS "estado"
         FROM aplicacion_pago_venta a
         JOIN pagos p ON p.id_pago = a.id_pago
         JOIN estados_pago ep ON ep.id_estado = p.id_estado
        WHERE a.id_factura_venta = $1
        ORDER BY p.fecha_pago`,
      [id],
    );
    return {
      ...this.conEstado(fila),
      pagos: pagos.map((p: any) => ({ ...p, montoAplicado: Number(p.montoAplicado) })),
    };
  }

  async getMorosos() {
    const vencidas = (await consultarSaldosVenta(this.db, { soloConSaldo: true })).filter(
      (f) => f.diasMora > 0,
    );

    const porCliente = new Map<string, any>();
    for (const f of vencidas) {
      const actual = porCliente.get(f.idCliente) ?? {
        idCliente: f.idCliente,
        cliente: f.cliente,
        documento: f.documento,
        facturasVencidas: 0,
        saldoVencido: 0,
        diasMoraMaximo: 0,
      };
      actual.facturasVencidas++;
      actual.saldoVencido = redondear(actual.saldoVencido + f.saldo);
      actual.diasMoraMaximo = Math.max(actual.diasMoraMaximo, f.diasMora);
      porCliente.set(f.idCliente, actual);
    }
    return [...porCliente.values()].sort((a, b) => b.saldoVencido - a.saldoVencido);
  }

  /** Cartera vencida por edades: 1-30, 31-60, 61-90 y más de 90 días. */
  async getCarteraVencida() {
    const vencidas = (await consultarSaldosVenta(this.db, { soloConSaldo: true })).filter(
      (f) => f.diasMora > 0,
    );
    const edades = { '1_a_30_dias': 0, '31_a_60_dias': 0, '61_a_90_dias': 0, mas_de_90_dias: 0 };
    for (const f of vencidas) {
      const rango =
        f.diasMora <= 30
          ? '1_a_30_dias'
          : f.diasMora <= 60
            ? '31_a_60_dias'
            : f.diasMora <= 90
              ? '61_a_90_dias'
              : 'mas_de_90_dias';
      edades[rango] = redondear(edades[rango] + f.saldo);
    }
    return {
      fechaCorte: fechaHoy(),
      totalVencida: redondear(vencidas.reduce((acc, f) => acc + f.saldo, 0)),
      facturasVencidas: vencidas.length,
      edades,
    };
  }

  async getCarteraResumen() {
    const pendientes: SaldoFacturaVenta[] = await consultarSaldosVenta(this.db, { soloConSaldo: true });
    const vencida = pendientes.filter((f) => f.diasMora > 0);
    const totalCartera = pendientes.reduce((acc, f) => acc + f.saldo, 0);
    const carteraVencida = vencida.reduce((acc, f) => acc + f.saldo, 0);

    return {
      fechaCorte: fechaHoy(),
      totalCartera: redondear(totalCartera),
      carteraAlDia: redondear(totalCartera - carteraVencida),
      carteraVencida: redondear(carteraVencida),
      facturasPendientes: pendientes.length,
      clientesConSaldo: new Set(pendientes.map((f) => f.idCliente)).size,
      clientesEnMora: new Set(vencida.map((f) => f.idCliente)).size,
    };
  }

  /**
   * Castiga una cuenta incobrable: la remisión pasa a CASTIGADA y sale de la
   * cartera activa. Requiere motivo y queda auditado (catálogo §25).
   */
  async castigarCartera(id: string, motivo: string, actor: Actor) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT 1 FROM facturas_venta WHERE id_factura_venta = $1 FOR UPDATE`, [id]);
      const [fila] = await consultarSaldosVenta(manager, { id, incluirCastigadas: true });
      if (!fila) throw new NotFoundException(`Cuenta por cobrar ${id} no encontrada o anulada`);
      if (fila.estado === 'CASTIGADA') throw new ConflictException('La cuenta ya fue castigada');
      if (fila.saldo <= 0) throw new ConflictException('La remisión no tiene saldo pendiente');
      if (fila.diasMora <= 0) throw new UnprocessableEntityException('Solo se castiga cartera vencida');
      await validarPeriodoAbierto(manager, fechaHoy(), 'castigar cartera');

      const [estado] = await manager.query(
        `SELECT id_estado FROM estados_factura_venta WHERE codigo = 'CASTIGADA'`,
      );
      if (!estado) throw new InternalServerErrorException('Falta el estado CASTIGADA en estados_factura_venta');
      await manager.query(
        `UPDATE facturas_venta SET id_estado = $2, motivo_castigo = $3 WHERE id_factura_venta = $1`,
        [id, estado.id_estado, motivo],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CASTIGAR',
          recurso: 'facturas_venta',
          idRecurso: id,
          valorAnterior: { estado: fila.estado, saldo: fila.saldo, diasMora: fila.diasMora },
          valorNuevo: { estado: 'CASTIGADA', saldoCastigado: fila.saldo },
          motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return {
        id,
        numeroVenta: fila.numeroVenta,
        estado: 'CASTIGADA',
        saldoCastigado: fila.saldo,
        mensaje: 'Cuenta castigada por incobrable',
      };
    });
  }

  // ─── Cuentas por pagar ─────────────────────────────────────────────────────

  async getCuentasPorPagar(idProveedor?: string) {
    const filas = await consultarSaldosCompra(this.db, { soloConSaldo: true, idContraparte: idProveedor });
    return filas.map((f) => this.conEstado(f));
  }

  async getCuentaPorPagar(id: string) {
    const [fila] = await consultarSaldosCompra(this.db, { id });
    if (!fila) throw new NotFoundException(`Cuenta por pagar ${id} no encontrada (o la factura está anulada)`);
    return this.conEstado(fila);
  }

  async getCuentasPorPagarProximasVencer(dias = 7) {
    const hoy = fechaHoy();
    const limite = sumarDias(hoy, dias);
    return (await this.getCuentasPorPagar()).filter(
      (c) => c.fechaVencimiento && c.fechaVencimiento >= hoy && c.fechaVencimiento <= limite,
    );
  }

  async getCuentasPorPagarVencidas() {
    return (await this.getCuentasPorPagar()).filter((c) => c.diasMora > 0);
  }

  /**
   * Encola el envío de recordatorios de cobro a los clientes en mora
   * (asíncrono, catálogo §25). Un solo envío en curso a la vez.
   */
  async enviarRecordatorios(opciones: { diasMoraMinimo?: number; idClientes?: string[] }, actor: Actor) {
    if (!(await this.correo.disponible())) {
      throw new UnprocessableEntityException('El correo no está configurado. Configure /configuracion/correo y SMTP_PASSWORD');
    }
    const job = await this.jobs.encolar(JOB_RECORDATORIOS, opciones, actor.id, { unico: true });
    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'ENVIAR_RECORDATORIOS',
      recurso: 'cartera',
      valorNuevo: { jobId: job.id_job, ...opciones },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { jobId: job.id_job, estado: job.estado, urlEstado: `/api/v1/reportes/jobs/${job.id_job}` };
  }

  private async procesarRecordatorios(opciones: { diasMoraMinimo?: number; idClientes?: string[] }) {
    const minimo = Number(opciones.diasMoraMinimo || 1);
    let morosos = (await this.getMorosos()).filter((m) => m.diasMoraMaximo >= minimo);
    if (opciones.idClientes?.length) morosos = morosos.filter((m) => opciones.idClientes!.includes(m.idCliente));

    const enviados: Array<{ cliente: string; email: string; saldoVencido: number }> = [];
    const sinCorreo: string[] = [];
    const fallidos: Array<{ cliente: string; error: string }> = [];

    for (const m of morosos) {
      const [contacto] = await this.dataSource.query(
        `SELECT e.email FROM clientes c JOIN emails e ON e.id_tercero = c.id_tercero
          WHERE c.id_cliente = $1 ORDER BY e.principal DESC NULLS LAST LIMIT 1`,
        [m.idCliente],
      );
      if (!contacto?.email) {
        sinCorreo.push(m.cliente);
        continue;
      }
      const facturas = (await consultarSaldosVenta(this.db, { idContraparte: m.idCliente, soloConSaldo: true })).filter(
        (f) => f.diasMora > 0,
      );
      const detalle = facturas
        .map((f) => `  • ${f.numeroVenta} — venció ${f.fechaVencimiento} (${f.diasMora} días) — saldo ${formatoMoneda(f.saldo)}`)
        .join('\n');
      try {
        await this.correo.enviar({
          para: contacto.email,
          asunto: 'Recordatorio de pago — documentos vencidos',
          texto:
            `Estimado(a) ${m.cliente}:\n\nLe recordamos que a la fecha presenta los siguientes documentos vencidos:\n\n` +
            `${detalle}\n\nSaldo vencido total: ${formatoMoneda(m.saldoVencido)}.\n\n` +
            'Si ya realizó el pago, por favor ignore este mensaje y envíenos el soporte.\n\nCordialmente,',
        });
        enviados.push({ cliente: m.cliente, email: contacto.email, saldoVencido: m.saldoVencido });
      } catch (err: any) {
        fallidos.push({ cliente: m.cliente, error: err.message });
      }
    }

    if (fallidos.length && !enviados.length) {
      throw new Error(`No se pudo enviar ningún recordatorio: ${fallidos[0].error}`);
    }
    return { resumen: { enviados: enviados.length, sinCorreo, fallidos, destinatarios: enviados } };
  }
}
