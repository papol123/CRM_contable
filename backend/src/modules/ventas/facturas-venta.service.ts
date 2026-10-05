import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { DetalleFacturaVenta } from '../../database/entities/detalle-factura-venta.entity';
import { EstadoFacturaVenta } from '../../database/entities/estado-factura-venta.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Cliente } from '../../database/entities/cliente.entity';
import {
  CreateFacturaVentaDto,
  CalcularFacturaDto,
  ConsultaRemisionesDto,
  UpdateFacturaVentaDto,
} from './dto/factura-venta.dto';
import { calcularLinea, calcularTotales, redondear } from '../../common/documentos/totales';
import { consultarSaldosVenta } from '../../common/documentos/saldos';
import {
  bloquearInventario,
  costoPromedio,
  resolverBodega,
  validarDisponibilidad,
} from '../../common/inventario/stock';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { PdfService } from '../../common/pdf/pdf.service';
import { ConsecutivosService } from './consecutivos.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

export interface OpcionesCreacionFactura {
  /** Pedido que se está facturando: su reserva no cuenta contra el stock disponible */
  excluirPedidoId?: string;
}

/**
 * Ventas emitidas como REMISIÓN (sin facturación electrónica DIAN).
 * Se mantiene la ruta /facturas-venta y la tabla facturas_venta del
 * catálogo; el número sale del consecutivo interno REMISION.
 */
@Injectable()
export class FacturasVentaService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FacturaVenta)
    private readonly facturaRepository: Repository<FacturaVenta>,
    private readonly consecutivos: ConsecutivosService,
    private readonly auditoria: AuditoriaService,
    private readonly pdf: PdfService,
  ) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAllFacturas(filtros: ConsultaRemisionesDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.facturaRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('f.estado', 'e')
      .leftJoinAndSelect('f.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .orderBy('f.fechaExpedicion', 'DESC')
      .addOrderBy('f.numeroVenta', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.search?.trim()) {
      query.andWhere(
        '(LOWER(f.numeroVenta) LIKE :search OR LOWER(t.razonSocial) LIKE :search OR LOWER(t.numeroDocumento) LIKE :search)',
        { search: `%${filtros.search.trim().toLowerCase()}%` },
      );
    }
    if (filtros.clienteId) query.andWhere('f.idCliente = :clienteId', { clienteId: filtros.clienteId });
    if (filtros.anulada !== undefined) query.andWhere('f.anulada = :anulada', { anulada: filtros.anulada });
    if (filtros.desde) query.andWhere('f.fechaExpedicion >= :desde', { desde: filtros.desde.slice(0, 10) });
    if (filtros.hasta) query.andWhere('f.fechaExpedicion <= :hasta', { hasta: filtros.hasta.slice(0, 10) });

    const [facturas, total] = await query.getManyAndCount();
    const saldos = new Map(
      (await consultarSaldosVenta(this.dataSource.manager, { ids: facturas.map((f) => f.id), incluirCastigadas: true })).map(
        (s) => [s.idFactura, s],
      ),
    );

    const data = facturas.map((f) => {
      const saldo = saldos.get(f.id);
      return {
        ...f,
        ...calcularTotales(f.detalles, f.retefuente),
        pagado: saldo?.pagado ?? 0,
        saldo: saldo?.saldo ?? 0,
        diasMora: saldo?.diasMora ?? 0,
      };
    });
    return paginado(data, total, pagina);
  }

  async findFacturaById(id: string): Promise<any> {
    const factura = await this.facturaRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('t.ciudad', 'ci')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.emails', 'em')
      .leftJoinAndSelect('t.direcciones', 'dir')
      .leftJoinAndSelect('f.estado', 'e')
      .leftJoinAndSelect('f.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .where('f.id = :id', { id })
      .getOne();

    if (!factura) throw new NotFoundException(`Remisión con ID ${id} no encontrada`);

    const [saldo] = await consultarSaldosVenta(this.dataSource.manager, {
      id,
      incluirCastigadas: true,
    });
    const pagos = await this.dataSource.query(
      `SELECT p.id_pago AS "idPago", p.fecha_pago AS "fechaPago", a.monto_aplicado AS "montoAplicado",
              mp.nombre AS "metodoPago", ep.codigo AS "estado"
         FROM aplicacion_pago_venta a
         JOIN pagos p ON p.id_pago = a.id_pago
         JOIN metodos_pago mp ON mp.id_metodo_pago = p.id_metodo_pago
         JOIN estados_pago ep ON ep.id_estado = p.id_estado
        WHERE a.id_factura_venta = $1
        ORDER BY p.fecha_pago`,
      [id],
    );

    return {
      ...factura,
      tipoDocumento: 'REMISION',
      detalles: factura.detalles.map((d) => ({ ...d, ...calcularLinea(d) })),
      ...calcularTotales(factura.detalles, factura.retefuente),
      pagado: saldo?.pagado ?? 0,
      saldo: saldo?.saldo ?? 0,
      diasMora: saldo?.diasMora ?? 0,
      pagos: pagos.map((p: any) => ({ ...p, montoAplicado: Number(p.montoAplicado) })),
    };
  }

  async getSiguienteConsecutivo() {
    return this.consecutivos.siguiente('REMISION');
  }

  calcular(dto: CalcularFacturaDto) {
    const totales = calcularTotales(dto.items);
    const retefuente = redondear(totales.subtotalNeto * ((dto.porcentajeRetefuente || 0) / 100));
    return {
      subtotal: totales.subtotal,
      totalDescuento: totales.totalDescuento,
      subtotalNeto: totales.subtotalNeto,
      totalIva: totales.totalIva,
      retefuente,
      totalPagar: redondear(totales.subtotalNeto + totales.totalIva - retefuente),
      items: dto.items.map((item) => ({ ...item, ...calcularLinea(item) })),
    };
  }

  // ─── Creación ──────────────────────────────────────────────────────────────

  async createFactura(dto: CreateFacturaVentaDto, actor?: Actor): Promise<any> {
    const id = await this.dataSource.transaction(async (manager) => {
      const idFactura = await this.crearEnTransaccion(manager, dto, actor?.id);
      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'CREAR',
          recurso: 'facturas_venta',
          idRecurso: idFactura,
          valorNuevo: dto,
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return idFactura;
    });
    return this.findFacturaById(id);
  }

  /**
   * Crea la remisión dentro de una transacción ya abierta (la usa también la
   * facturación de pedidos). En una sola transacción (catálogo §12):
   * stock → consecutivo → IVA y descuentos por línea → totales → detalle →
   * salida de inventario a costo → cuenta por cobrar (saldo) si es a crédito.
   */
  async crearEnTransaccion(
    manager: EntityManager,
    dto: CreateFacturaVentaDto,
    idUsuario?: string,
    opciones: OpcionesCreacionFactura = {},
  ): Promise<string> {
    const cliente = await manager.findOne(Cliente, { where: { id: dto.idCliente } });
    if (!cliente) throw new NotFoundException(`Cliente con ID ${dto.idCliente} no encontrado`);
    if (!cliente.tercero?.activo) {
      throw new UnprocessableEntityException('El cliente está inactivo y no se le puede vender');
    }

    const fechaExpedicion = dto.fechaExpedicion?.slice(0, 10) || fechaHoy();
    const fechaVencimiento =
      dto.fechaVencimiento?.slice(0, 10) || sumarDias(fechaExpedicion, Number(cliente.diasPlazo || 0));
    if (fechaVencimiento < fechaExpedicion) {
      throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de expedición');
    }
    await validarPeriodoAbierto(manager, fechaExpedicion, 'registrar la remisión');

    await bloquearInventario(manager);

    const idBodega = await resolverBodega(manager, dto.idBodega);
    const conInventario = await validarDisponibilidad(manager, dto.items, idBodega, {
      excluirPedidoId: opciones.excluirPedidoId,
    });

    const estado = await manager.findOne(EstadoFacturaVenta, { where: { codigo: 'EMITIDA' } });
    if (!estado) {
      throw new InternalServerErrorException(
        'Falta el estado EMITIDA en estados_factura_venta. Ejecute npm run seed',
      );
    }

    const totales = calcularTotales(dto.items, dto.retefuente || 0);
    if (totales.total < 0) {
      throw new UnprocessableEntityException('La retención no puede superar el valor de la remisión');
    }

    // Venta a crédito: cliente sin bloqueo y saldo pendiente + esta venta dentro del cupo
    if (fechaVencimiento > fechaExpedicion) {
      if (cliente.creditoBloqueado) {
        throw new UnprocessableEntityException({
          message: `El crédito del cliente está bloqueado${cliente.motivoBloqueo ? `: ${cliente.motivoBloqueo}` : ''}. Solo se le puede vender de contado`,
          tipo: 'credito-bloqueado',
        });
      }
      const pendientes = await consultarSaldosVenta(manager, {
        idContraparte: cliente.id,
        soloConSaldo: true,
      });
      const saldoActual = pendientes.reduce((acc, f) => acc + f.saldo, 0);
      const cupo = Number(cliente.cupoCredito || 0);
      if (saldoActual + totales.total > cupo) {
        throw new UnprocessableEntityException({
          message: `Cupo de crédito insuficiente. Cupo: ${cupo}, saldo pendiente: ${redondear(saldoActual)}, esta venta: ${totales.total}`,
          tipo: 'cupo-insuficiente',
        });
      }
    }

    const numero = await this.consecutivos.tomar(manager, 'REMISION');

    const factura = await manager.save(
      FacturaVenta,
      manager.create(FacturaVenta, {
        idCliente: dto.idCliente,
        idEstado: estado.id,
        numeroVenta: numero,
        fechaExpedicion,
        fechaVencimiento,
        retefuente: dto.retefuente || 0,
        anulada: false,
        idBodega,
        idUsuario,
        observaciones: dto.observaciones,
        estadoDian: 'NO_APLICA',
      }),
    );

    for (const item of dto.items) {
      await manager.save(
        DetalleFacturaVenta,
        manager.create(DetalleFacturaVenta, {
          idFacturaVenta: factura.id,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          pctDescuento: item.pctDescuento || 0,
          pctIva: item.pctIva || 0,
        }),
      );

      if (conInventario.has(item.idProducto)) {
        // El kardex registra la salida a costo, no a precio de venta
        await manager.save(
          MovimientoInventario,
          manager.create(MovimientoInventario, {
            idProducto: item.idProducto,
            idBodega,
            tipoMovimiento: 'SALIDA',
            cantidad: item.cantidad,
            costoUnitario: await costoPromedio(manager, item.idProducto),
            origenTabla: 'facturas_venta',
            origenId: factura.id,
            idUsuario,
            motivo: `Remisión ${numero}`,
          }),
        );
      }
    }

    return factura.id;
  }

  /** Solo campos no financieros: vencimiento y observaciones. */
  async updateFactura(id: string, dto: UpdateFacturaVentaDto): Promise<any> {
    const factura = await this.facturaRepository.findOne({ where: { id } });
    if (!factura) throw new NotFoundException(`Remisión con ID ${id} no encontrada`);
    if (factura.anulada) {
      throw new ConflictException('No se puede modificar una remisión anulada');
    }

    const cambios: Partial<FacturaVenta> = {};
    if (dto.fechaVencimiento) {
      const fecha = dto.fechaVencimiento.slice(0, 10);
      if (fecha < String(factura.fechaExpedicion).slice(0, 10)) {
        throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de expedición');
      }
      cambios.fechaVencimiento = fecha;
    }
    if (dto.observaciones !== undefined) cambios.observaciones = dto.observaciones;
    if (Object.keys(cambios).length > 0) await this.facturaRepository.update(id, cambios);

    return this.findFacturaById(id);
  }

  // ─── Anulación ─────────────────────────────────────────────────────────────

  /**
   * No borra nada: marca la remisión ANULADA, devuelve al inventario lo que
   * salió (movimientos compensatorios) y anula el pedido de origen.
   */
  async anularFactura(id: string, motivo: string, actor?: Actor) {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);

      // Bloquea la fila: dos anulaciones simultáneas no pueden pasar ambas la validación
      await manager.query(`SELECT 1 FROM facturas_venta WHERE id_factura_venta = $1 FOR UPDATE`, [id]);
      const factura = await manager.findOne(FacturaVenta, { where: { id } });
      if (!factura) throw new NotFoundException(`Remisión con ID ${id} no encontrada`);
      if (factura.anulada) throw new ConflictException('La remisión ya se encuentra anulada');
      if (factura.estado?.codigo === 'CASTIGADA') {
        throw new ConflictException('La remisión fue castigada como cartera incobrable y no se puede anular');
      }
      await validarPeriodoAbierto(manager, factura.fechaExpedicion, 'anular la remisión');

      // No se anula una remisión con pagos vigentes: primero se reversan los pagos
      const [saldo] = await consultarSaldosVenta(manager, { id, incluirCastigadas: true });
      if (saldo && saldo.pagado > 0) {
        throw new ConflictException(
          `La remisión tiene pagos aplicados por ${saldo.pagado}. Anule los pagos antes de anular la remisión`,
        );
      }

      const estadoAnulada = await manager.findOne(EstadoFacturaVenta, { where: { codigo: 'ANULADA' } });
      if (!estadoAnulada) {
        throw new InternalServerErrorException('Falta el estado ANULADA en estados_factura_venta');
      }

      // Se devuelve exactamente lo que salió, a la misma bodega y al mismo costo
      const salidas = await manager.find(MovimientoInventario, {
        where: { origenTabla: 'facturas_venta', origenId: factura.id },
      });
      for (const salida of salidas) {
        await manager.save(
          MovimientoInventario,
          manager.create(MovimientoInventario, {
            idProducto: salida.idProducto,
            idBodega: salida.idBodega,
            tipoMovimiento: 'AJUSTE_ENTRADA',
            cantidad: salida.cantidad,
            costoUnitario: salida.costoUnitario,
            origenTabla: 'anulacion_factura_venta',
            origenId: factura.id,
            idUsuario: actor?.id,
            motivo: `Anulación remisión ${factura.numeroVenta}: ${motivo}`,
          }),
        );
      }

      await manager.update(FacturaVenta, id, {
        anulada: true,
        idEstado: estadoAnulada.id,
        motivoAnulacion: motivo,
      });

      // Si venía de un pedido, el pedido queda anulado (no vuelve a reservar stock)
      const pedidos: Array<{ id_pedido: string }> = await manager.query(
        `SELECT id_pedido FROM pedidos WHERE id_factura_venta = $1`,
        [id],
      );
      for (const p of pedidos) {
        await manager.query(
          `UPDATE pedidos SET estado = 'ANULADO', motivo_anulacion = $2 WHERE id_pedido = $1`,
          [p.id_pedido, `Remisión ${factura.numeroVenta} anulada: ${motivo}`],
        );
        await manager.query(
          `INSERT INTO historial_estados_pedido (id_pedido, estado, id_usuario, observacion)
           VALUES ($1, 'ANULADO', $2, $3)`,
          [p.id_pedido, actor?.id || null, `Remisión ${factura.numeroVenta} anulada`],
        );
      }

      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'ANULAR',
          recurso: 'facturas_venta',
          idRecurso: id,
          valorAnterior: { numero: factura.numeroVenta, estado: factura.estado?.codigo, anulada: false },
          valorNuevo: { estado: 'ANULADA', movimientosCompensatorios: salidas.length, pedidosAnulados: pedidos.length },
          motivo,
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );

      return {
        message: `Remisión ${factura.numeroVenta} anulada. Motivo: ${motivo}`,
        anulada: true,
        movimientosReversados: salidas.length,
      };
    });
  }

  async getFacturaPdf(id: string): Promise<{ contenido: Buffer; nombre: string }> {
    const f = await this.findFacturaById(id);
    const t = f.cliente.tercero;
    const contenido = await this.pdf.documento({
      titulo: 'Remisión',
      numero: f.numeroVenta,
      campos: [
        ['Fecha', String(f.fechaExpedicion).slice(0, 10)],
        ['Vencimiento', f.fechaVencimiento ? String(f.fechaVencimiento).slice(0, 10) : 'Contado'],
        ['Estado', f.anulada ? `ANULADA — ${f.motivoAnulacion ?? ''}` : f.estado?.nombre ?? f.estado?.codigo],
      ],
      tercero: {
        etiqueta: 'Cliente',
        nombre: t.razonSocial,
        documento: t.numeroDocumento,
        direccion: t.direcciones?.[0]?.direccion,
        telefono: t.telefonos?.[0]?.numero,
        email: t.emails?.[0]?.email,
      },
      lineas: f.detalles.map((d: any) => ({
        codigo: d.producto?.codigo ?? '',
        descripcion: d.producto?.nombre ?? '',
        cantidad: Number(d.cantidad),
        valorUnitario: Number(d.valorUnitario),
        pctDescuento: Number(d.pctDescuento),
        pctIva: Number(d.pctIva),
        total: d.totalLinea,
      })),
      totales: [
        ['Subtotal', f.subtotal],
        ['Descuentos', -f.totalDescuento],
        ['IVA', f.totalIva],
        ...(f.retefuente ? ([['Retención en la fuente', -f.retefuente]] as Array<[string, number]>) : []),
        ['Total', f.total],
      ],
      notas: [f.observaciones, f.saldo > 0 ? `Saldo pendiente: ${f.saldo}` : null].filter(Boolean) as string[],
      pie: 'Remisión de mercancía. Este documento no es una factura electrónica de venta.',
    });
    return { contenido, nombre: `${f.numeroVenta}.pdf` };
  }
}
