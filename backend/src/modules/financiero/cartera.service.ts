import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  consultarSaldosCompra,
  consultarSaldosVenta,
  SaldoFacturaVenta,
} from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';

@Injectable()
export class CarteraService {
  constructor(private readonly dataSource: DataSource) {}

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

  /** Marca como CASTIGADA una factura vencida con saldo: sale de la cartera activa. */
  async castigarCartera(id: string) {
    const [fila] = await consultarSaldosVenta(this.db, { id, incluirCastigadas: true });
    if (!fila) throw new NotFoundException(`Factura ${id} no encontrada o anulada`);
    if (fila.estado === 'CASTIGADA') throw new ConflictException('La factura ya fue castigada');
    if (fila.saldo <= 0) throw new ConflictException('La factura no tiene saldo pendiente');
    if (fila.diasMora <= 0) throw new ConflictException('Solo se castiga cartera vencida');

    const [estado] = await this.db.query(
      `SELECT id_estado FROM estados_factura_venta WHERE codigo = 'CASTIGADA'`,
    );
    if (!estado) throw new InternalServerErrorException('Falta el estado CASTIGADA en estados_factura_venta');
    await this.db.query(`UPDATE facturas_venta SET id_estado = $2 WHERE id_factura_venta = $1`, [
      id,
      estado.id_estado,
    ]);

    return {
      id,
      numeroVenta: fila.numeroVenta,
      estado: 'CASTIGADA',
      saldoCastigado: fila.saldo,
      mensaje: 'Factura castigada contablemente por incobrabilidad',
    };
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
}
