import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  RemisionRapidaDto,
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
import { PagosService } from '../financiero/pagos.service';
import { MetodoPago } from '../../database/entities/metodo-pago.entity';

/** Marca del cobro que se crea junto con una remisión de contado (se anula con ella). */
const PREFIJO_PAGO_CONTADO_VENTA = 'Cobro de contado de la remisión';

/** Documento del cliente "Consumidor final" (migración 008). */
const DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';
import { PERMISOS_GLOBALES, asegurarPropietario, filtroPropietario } from '../../common/autorizacion/propiedad';

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
    private readonly pagos: PagosService,
  ) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAllFacturas(filtros: ConsultaRemisionesDto = {}, actor?: Actor) {
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
    // Sin ventas.consultar_todos cada usuario solo ve sus remisiones (GEMINI.md §5.4)
    const propietario = filtroPropietario(actor, PERMISOS_GLOBALES.ventas);
    if (propietario) query.andWhere('f.idUsuario = :propietario', { propietario });
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

  async findFacturaById(id: string, actor?: Actor): Promise<any> {
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
    asegurarPropietario(factura.idUsuario, actor, PERMISOS_GLOBALES.ventas, `Remisión con ID ${id} no encontrada`);

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
    const total = redondear(totales.subtotalNeto + totales.totalIva - retefuente);
    return {
      subtotal: totales.subtotal,
      totalDescuento: totales.totalDescuento,
      subtotalNeto: totales.subtotalNeto,
      totalIva: totales.totalIva,
      retefuente,
      total,
      totalPagar: total,
      items: dto.items.map((item) => ({ ...item, ...calcularLinea(item) })),
    };
  }

  // ─── Creación ──────────────────────────────────────────────────────────────

  async createFactura(dto: CreateFacturaVentaDto, actor?: Actor): Promise<any> {
    if (dto.pagadaDeContado && actor && !actor.permisos.includes('pagos.registrar')) {
      throw new ForbiddenException('Registrar la venta pagada de contado requiere el permiso pagos.registrar');
    }
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

      // Venta de contado: el cobro por el total se registra en la misma transacción
      if (dto.pagadaDeContado) await this.registrarCobroContado(manager, idFactura, dto.idMetodoPago, actor);
      return idFactura;
    });
    return this.findFacturaById(id);
  }

  /** Registra el cobro por el saldo total de la remisión (venta de contado). */
  private async registrarCobroContado(manager: EntityManager, idFactura: string, idMetodoPago: string | undefined, actor?: Actor) {
    const [saldo] = await consultarSaldosVenta(manager, { id: idFactura });
    if (!saldo || saldo.saldo <= 0) return;
    const factura = await manager.findOne(FacturaVenta, { where: { id: idFactura } });
    const referencia = factura?.numeroExterno || factura?.numeroVenta || '';
    await this.pagos.registrarEnTransaccion(
      manager,
      {
        tipoPago: 'factura de venta',
        idFactura,
        idMetodoPago: idMetodoPago || (await this.metodoEfectivo(manager)),
        monto: saldo.saldo,
        fechaPago: factura?.fechaExpedicion,
        observaciones: `${PREFIJO_PAGO_CONTADO_VENTA} ${referencia}`.trim(),
      },
      actor,
    );
  }

  /** Id del cliente "Consumidor final" (migración 008). */
  private async idConsumidorFinal(manager: EntityManager): Promise<string> {
    const [fila] = await manager.query(
      `SELECT c.id_cliente FROM clientes c JOIN terceros t ON t.id_tercero = c.id_tercero
        WHERE t.numero_documento = $1`,
      [DOCUMENTO_CONSUMIDOR_FINAL],
    );
    if (!fila) throw new UnprocessableEntityException('No existe el cliente Consumidor final. Ejecute npm run db:migrate');
    return fila.id_cliente;
  }

  /**
   * Remisión rápida: solo número de la factura física y valor. Se registra como
   * remisión real (consecutivo REM, cartera, cierres) con una línea del producto
   * VENTA-GENERAL, que no mueve inventario. A crédito queda en Deudores.
   */
  async crearRapida(dto: RemisionRapidaDto, actor: Actor): Promise<any> {
    if (!dto.credito && !actor.permisos.includes('pagos.registrar')) {
      throw new ForbiddenException('Registrar la venta de contado requiere el permiso pagos.registrar');
    }
    const numeroExterno = dto.numeroFactura.trim();
    const fecha = dto.fecha?.slice(0, 10) || fechaHoy();

    const id = await this.dataSource.transaction(async (manager) => {
      const [repetida] = await manager.query(
        `SELECT numero_venta FROM facturas_venta WHERE anulada = false AND LOWER(numero_externo) = LOWER($1)`,
        [numeroExterno],
      );
      if (repetida) {
        throw new ConflictException(`La factura N° ${numeroExterno} ya está registrada (${repetida.numero_venta})`);
      }
      const [producto] = await manager.query(`SELECT id_producto FROM productos WHERE codigo = 'VENTA-GENERAL'`);
      if (!producto) throw new UnprocessableEntityException('Falta el producto VENTA-GENERAL. Ejecute npm run db:migrate');

      const idCliente = dto.idCliente || (await this.idConsumidorFinal(manager));
      const idFactura = await this.crearEnTransaccion(
        manager,
        {
          idCliente,
          fechaExpedicion: fecha,
          fechaVencimiento: dto.credito ? sumarDias(fecha, dto.diasPlazo || 30) : fecha,
          nombreDeudor: dto.nombreDeudor,
          observaciones: dto.observaciones,
          items: [{ idProducto: producto.id_producto, cantidad: 1, valorUnitario: dto.valor, pctDescuento: 0, pctIva: 0 }],
        },
        actor.id,
      );
      await manager.query(`UPDATE facturas_venta SET numero_externo = $2 WHERE id_factura_venta = $1`, [idFactura, numeroExterno]);
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CREAR_REMISION_RAPIDA',
          recurso: 'facturas_venta',
          idRecurso: idFactura,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      if (!dto.credito) await this.registrarCobroContado(manager, idFactura, dto.idMetodoPago, actor);
      return idFactura;
    });
    return this.findFacturaById(id);
  }

  private async metodoEfectivo(manager: EntityManager): Promise<string> {
    const metodo = await manager.findOne(MetodoPago, { where: { codigo: 'EFECTIVO' } });
    if (!metodo) throw new UnprocessableEntityException('Indique idMetodoPago: no existe el medio de pago EFECTIVO');
    return metodo.id;
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

    // Consumidor final: agrupa muchos compradores sin identificar. Se le fía sin cupo,
    // pero hay que decir quién queda debiendo para poder cobrarle (página Deudores).
    const esConsumidorFinal = cliente.tercero?.numeroDocumento === DOCUMENTO_CONSUMIDOR_FINAL;
    const nombreDeudor = dto.nombreDeudor?.trim() || null;
    if (fechaVencimiento > fechaExpedicion && esConsumidorFinal && !nombreDeudor) {
      throw new UnprocessableEntityException({
        message: 'Para fiar a Consumidor final indique el nombre de quien queda debiendo',
        tipo: 'falta-nombre-deudor',
      });
    }

    // Venta a crédito: cliente sin bloqueo y saldo pendiente + esta venta dentro del cupo
    if (fechaVencimiento > fechaExpedicion && !esConsumidorFinal) {
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
        nombreDeudor: fechaVencimiento > fechaExpedicion ? nombreDeudor : null,
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
  async updateFactura(id: string, dto: UpdateFacturaVentaDto, actor?: Actor): Promise<any> {
    const factura = await this.facturaRepository.findOne({ where: { id } });
    if (!factura) throw new NotFoundException(`Remisión con ID ${id} no encontrada`);
    asegurarPropietario(factura.idUsuario, actor, PERMISOS_GLOBALES.ventas, `Remisión con ID ${id} no encontrada`);
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

    return this.findFacturaById(id, actor);
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

      // El cobro de contado que se registró junto con la remisión se anula con ella.
      // Los abonos registrados aparte (POST /pagos) se siguen exigiendo anular primero.
      const pagosDeContado: { id_pago: string }[] = await manager.query(
        `SELECT ap.id_pago
           FROM aplicacion_pago_venta ap
           JOIN pagos p ON p.id_pago = ap.id_pago
           JOIN estados_pago ep ON ep.id_estado = p.id_estado
          WHERE ap.id_factura_venta = $1
            AND ep.codigo <> 'ANULADO'
            AND p.observaciones LIKE $2
            AND NOT EXISTS (SELECT 1 FROM aplicacion_pago_venta o
                             WHERE o.id_pago = ap.id_pago AND o.id_factura_venta <> $1)`,
        [id, `${PREFIJO_PAGO_CONTADO_VENTA}%`],
      );
      for (const { id_pago } of pagosDeContado) {
        await this.pagos.anularEnTransaccion(manager, id_pago, `Anulación de la remisión: ${motivo}`, actor);
      }

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

  async getFacturaPdf(id: string, actor?: Actor): Promise<{ contenido: Buffer; nombre: string }> {
    const f = await this.findFacturaById(id, actor);
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
