import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Pago,
  EstadoPago,
  AplicacionPagoVenta,
  AplicacionPagoCompra,
} from '../../database/entities/pagos-gastos.entity';
import { MetodoPago } from '../../database/entities/metodo-pago.entity';
import { ConsultaPagosDto, CreatePagoDto } from './dto/pagos-gastos.dto';
import { consultarSaldosCompra, consultarSaldosVenta } from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { fechaHoy } from '../../common/utils/fechas';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { PdfService } from '../../common/pdf/pdf.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

/** Sin este permiso, el usuario solo ve los pagos que él registró (GEMINI §5.2 "Pagos propios", §5.4) */
export const PERMISO_PAGOS_TODOS = 'pagos.consultar_todos';

const puedeVerTodos = (actor?: Actor) => !actor || actor.permisos.includes(PERMISO_PAGOS_TODOS);

@Injectable()
export class PagosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Pago)
    private readonly pagoRepository: Repository<Pago>,
    private readonly pdf: PdfService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros: ConsultaPagosDto = {}, actor?: Actor) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.pagoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('p.metodoPago', 'm')
      .leftJoinAndSelect('p.estado', 'e')
      .orderBy('p.fechaPago', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);
    if (!puedeVerTodos(actor)) query.andWhere('p.idUsuario = :uid', { uid: actor!.id });
    if (filtros.tipoPago) query.andWhere('p.tipoPago = :tipo', { tipo: filtros.tipoPago });
    if (filtros.idTercero) query.andWhere('p.idTercero = :idTercero', { idTercero: filtros.idTercero });
    if (filtros.desde) query.andWhere('p.fechaPago >= :desde', { desde: filtros.desde.slice(0, 10) });
    if (filtros.hasta) query.andWhere('p.fechaPago <= :hasta', { hasta: filtros.hasta.slice(0, 10) });

    const [data, total] = await query.getManyAndCount();
    return paginado(data, total, pagina);
  }

  async findById(id: string, actor?: Actor): Promise<any> {
    const pago = await this.pagoRepository.findOne({
      where: { id },
      relations: ['tercero', 'metodoPago', 'estado'],
    });
    // Un pago ajeno responde 404 igual que uno inexistente: no se revela que existe (§5.4)
    if (!pago || (!puedeVerTodos(actor) && pago.idUsuario !== actor!.id)) throw new NotFoundException(`Pago con ID ${id} no encontrado`);

    const aplicaciones = await this.dataSource.query(
      `SELECT a.id_factura_venta AS "idFactura", f.numero_venta AS "numero", a.monto_aplicado AS "montoAplicado"
         FROM aplicacion_pago_venta a JOIN facturas_venta f ON f.id_factura_venta = a.id_factura_venta
        WHERE a.id_pago = $1
       UNION ALL
       SELECT a.id_factura_compra, fc.numero_factura, a.monto_aplicado
         FROM aplicacion_pago_compra a JOIN facturas_compra fc ON fc.id_factura_compra = a.id_factura_compra
        WHERE a.id_pago = $1`,
      [id],
    );
    return {
      ...pago,
      aplicaciones: aplicaciones.map((a: any) => ({ ...a, montoAplicado: Number(a.montoAplicado) })),
    };
  }

  /**
   * Registra un pago o abono. Si trae factura, el monto no puede superar su
   * saldo (A6) y, si la deja en cero, la factura pasa a PAGADA.
   */
  async create(dto: CreatePagoDto, actor?: Actor): Promise<any> {
    const idUsuario = actor?.id;
    const fechaPago = dto.fechaPago?.slice(0, 10) || fechaHoy();
    const id = await this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fechaPago, 'registrar el pago');
      // Serializa pagos para que dos abonos simultáneos no superen el saldo
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('crm_pagos'))`);

      const metodo = await manager.findOne(MetodoPago, { where: { id: dto.idMetodoPago } });
      if (!metodo) throw new NotFoundException(`Método de pago ${dto.idMetodoPago} no encontrado`);

      const estadoAplicado = await this.estado(manager, 'APLICADO');
      const esVenta = dto.tipoPago === 'factura de venta';
      const monto = redondear(dto.monto);

      let idTercero = await this.resolverTercero(manager, dto, esVenta);
      let saldoRestante: number | null = null;

      if (dto.idFactura) {
        const factura = esVenta
          ? await this.saldoFacturaVenta(manager, dto.idFactura)
          : await this.saldoFacturaCompra(manager, dto.idFactura);

        if (idTercero && idTercero !== factura.idTercero) {
          throw new BadRequestException('La factura no pertenece al tercero indicado en el pago');
        }
        idTercero = factura.idTercero;

        if (factura.saldo <= 0) {
          throw new ConflictException('La factura no tiene saldo pendiente');
        }
        if (monto > factura.saldo) {
          throw new UnprocessableEntityException({
            message: `El pago (${monto}) supera el saldo pendiente del documento (${factura.saldo})`,
            tipo: 'pago-supera-saldo',
          });
        }
        saldoRestante = redondear(factura.saldo - monto);
      }

      if (!idTercero) {
        throw new BadRequestException('Indique idFactura, idTercero, idCliente o idProveedor');
      }

      const pago = await manager.save(
        Pago,
        manager.create(Pago, {
          idTercero,
          idMetodoPago: dto.idMetodoPago,
          idEstado: estadoAplicado.id,
          tipoPago: dto.tipoPago,
          monto,
          fechaPago,
          idUsuario,
          observaciones: dto.observaciones,
        }),
      );

      if (dto.idFactura) {
        if (esVenta) {
          await manager.save(AplicacionPagoVenta, {
            idPago: pago.id,
            idFacturaVenta: dto.idFactura,
            montoAplicado: monto,
          });
          if (saldoRestante === 0) await this.cambiarEstadoFactura(manager, 'venta', dto.idFactura, 'PAGADA');
        } else {
          await manager.save(AplicacionPagoCompra, {
            idPago: pago.id,
            idFacturaCompra: dto.idFactura,
            montoAplicado: monto,
          });
          if (saldoRestante === 0) await this.cambiarEstadoFactura(manager, 'compra', dto.idFactura, 'PAGADA');
        }
      }
      await this.auditoria.registrar(
        {
          idUsuario,
          accion: 'CREAR',
          recurso: 'pagos',
          idRecurso: pago.id,
          valorNuevo: { ...dto, monto, saldoRestante },
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return pago.id;
    });
    return this.findById(id);
  }

  /** A5: anula el pago y reabre el saldo de las facturas a las que se aplicó. */
  async anular(id: string, motivo: string, actor?: Actor) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('crm_pagos'))`);
      const pago = await manager.findOne(Pago, { where: { id } });
      if (!pago) throw new NotFoundException(`Pago con ID ${id} no encontrado`);
      if (pago.estado?.codigo === 'ANULADO') throw new ConflictException('El pago ya se encuentra anulado');
      await validarPeriodoAbierto(manager, pago.fechaPago, 'reversar el pago');

      const estadoAnulado = await this.estado(manager, 'ANULADO');
      await manager.update(Pago, id, { idEstado: estadoAnulado.id, motivoAnulacion: motivo });

      const ventas = await manager.find(AplicacionPagoVenta, { where: { idPago: id } });
      for (const a of ventas) await this.cambiarEstadoFactura(manager, 'venta', a.idFacturaVenta, 'EMITIDA');
      const compras = await manager.find(AplicacionPagoCompra, { where: { idPago: id } });
      for (const a of compras) await this.cambiarEstadoFactura(manager, 'compra', a.idFacturaCompra, 'RECIBIDA');

      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'ANULAR',
          recurso: 'pagos',
          idRecurso: id,
          valorAnterior: { estado: pago.estado?.codigo, monto: Number(pago.monto) },
          valorNuevo: { estado: 'ANULADO', documentosReabiertos: ventas.length + compras.length },
          motivo,
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );

      return {
        id,
        anulado: true,
        facturasReabiertas: ventas.length + compras.length,
        mensaje: `Pago anulado exitosamente: ${motivo}`,
      };
    });
  }

  /** Recibo de caja (pagos de clientes) o comprobante de egreso (pagos a proveedores). */
  async getRecibo(id: string, actor?: Actor): Promise<{ contenido: Buffer; nombre: string }> {
    const pago = await this.findById(id, actor);
    const esVenta = pago.tipoPago === 'factura de venta';
    const titulo = esVenta ? 'Recibo de caja' : 'Comprobante de egreso';
    const numero = `${esVenta ? 'RC' : 'CE'}-${String(pago.id).slice(0, 8).toUpperCase()}`;
    const contenido = await this.pdf.documento({
      titulo,
      numero,
      campos: [
        ['Fecha', String(pago.fechaPago).slice(0, 10)],
        ['Medio de pago', pago.metodoPago?.nombre ?? ''],
        ['Estado', pago.estado?.codigo === 'ANULADO' ? `ANULADO — ${pago.motivoAnulacion ?? ''}` : pago.estado?.codigo ?? ''],
      ],
      tercero: {
        etiqueta: esVenta ? 'Recibido de' : 'Pagado a',
        nombre: pago.tercero?.razonSocial ?? '',
        documento: pago.tercero?.numeroDocumento,
      },
      tabla: pago.aplicaciones.length
        ? {
            columnas: ['Documento', 'Valor aplicado'],
            anchos: [315, 200],
            alineacion: ['left', 'right'],
            filas: pago.aplicaciones.map((a: any) => [a.numero ?? a.idFactura, a.montoAplicado.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })]),
          }
        : undefined,
      totales: [['Total', Number(pago.monto)]],
      notas: [pago.observaciones].filter(Boolean),
    });
    return { contenido, nombre: `${numero}.pdf` };
  }

  private async resolverTercero(manager: EntityManager, dto: CreatePagoDto, esVenta: boolean) {
    if (dto.idTercero) {
      const [t] = await manager.query(`SELECT id_tercero FROM terceros WHERE id_tercero = $1`, [dto.idTercero]);
      if (!t) throw new NotFoundException(`Tercero con ID ${dto.idTercero} no encontrado`);
      return dto.idTercero;
    }
    if (dto.idCliente) {
      if (!esVenta) throw new BadRequestException('idCliente solo aplica a pagos de facturas de venta');
      const [c] = await manager.query(`SELECT id_tercero FROM clientes WHERE id_cliente = $1`, [dto.idCliente]);
      if (!c) throw new NotFoundException(`Cliente con ID ${dto.idCliente} no encontrado`);
      return c.id_tercero as string;
    }
    if (dto.idProveedor) {
      if (esVenta) throw new BadRequestException('idProveedor solo aplica a pagos de facturas de compra');
      const [p] = await manager.query(`SELECT id_tercero FROM proveedores WHERE id_proveedor = $1`, [dto.idProveedor]);
      if (!p) throw new NotFoundException(`Proveedor con ID ${dto.idProveedor} no encontrado`);
      return p.id_tercero as string;
    }
    return undefined;
  }

  private async saldoFacturaVenta(manager: EntityManager, id: string) {
    const [saldo] = await consultarSaldosVenta(manager, { id, incluirCastigadas: true });
    if (!saldo) {
      const [f] = await manager.query(`SELECT anulada FROM facturas_venta WHERE id_factura_venta = $1`, [id]);
      if (f?.anulada) throw new ConflictException('No se puede pagar una factura anulada');
      throw new NotFoundException(`Factura de venta con ID ${id} no encontrada`);
    }
    if (saldo.estado === 'CASTIGADA') {
      throw new ConflictException('La factura fue castigada como cartera incobrable');
    }
    return saldo;
  }

  private async saldoFacturaCompra(manager: EntityManager, id: string) {
    const [saldo] = await consultarSaldosCompra(manager, { id });
    if (!saldo) {
      const [f] = await manager.query(`SELECT 1 FROM facturas_compra WHERE id_factura_compra = $1`, [id]);
      if (f) throw new ConflictException('No se puede pagar una factura de compra anulada');
      throw new NotFoundException(`Factura de compra con ID ${id} no encontrada`);
    }
    return saldo;
  }

  private async estado(manager: EntityManager, codigo: string): Promise<EstadoPago> {
    const estado = await manager.findOne(EstadoPago, { where: { codigo } });
    if (!estado) throw new InternalServerErrorException(`Falta el estado ${codigo} en estados_pago`);
    return estado;
  }

  /** Cambia el estado de la factura solo entre EMITIDA/RECIBIDA y PAGADA. */
  private async cambiarEstadoFactura(
    manager: EntityManager,
    tipo: 'venta' | 'compra',
    idFactura: string,
    codigo: string,
  ) {
    // Una consulta fija por tipo de documento (GEMINI.md §4.5: sin nombres de tabla variables)
    if (tipo === 'venta') {
      await manager.query(
        `UPDATE facturas_venta f
            SET id_estado = (SELECT id_estado FROM estados_factura_venta WHERE codigo = $2)
          WHERE f.id_factura_venta = $1
            AND f.id_estado IN (SELECT id_estado FROM estados_factura_venta WHERE codigo IN ('EMITIDA', 'PAGADA'))`,
        [idFactura, codigo],
      );
    } else {
      await manager.query(
        `UPDATE facturas_compra f
            SET id_estado = (SELECT id_estado FROM estados_factura_compra WHERE codigo = $2)
          WHERE f.id_factura_compra = $1
            AND f.id_estado IN (SELECT id_estado FROM estados_factura_compra WHERE codigo IN ('RECIBIDA', 'PAGADA'))`,
        [idFactura, codigo],
      );
    }
  }
}
