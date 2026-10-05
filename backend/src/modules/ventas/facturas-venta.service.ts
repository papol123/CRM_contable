import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { DetalleFacturaVenta } from '../../database/entities/detalle-factura-venta.entity';
import { EstadoFacturaVenta } from '../../database/entities/estado-factura-venta.entity';
import { ResolucionDian } from '../../database/entities/resolucion-dian.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Cliente } from '../../database/entities/cliente.entity';
import {
  CreateFacturaVentaDto,
  CalcularFacturaDto,
  UpdateFacturaVentaDto,
} from './dto/factura-venta.dto';
import { CreateResolucionDianDto, UpdateResolucionDianDto } from './dto/ventas-documentos.dto';
import { calcularLinea, calcularTotales, redondear } from '../../common/documentos/totales';
import { consultarSaldosVenta } from '../../common/documentos/saldos';
import {
  bloquearInventario,
  costoPromedio,
  resolverBodega,
  validarDisponibilidad,
} from '../../common/inventario/stock';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';

export interface OpcionesCreacionFactura {
  /** Pedido que se está facturando: su reserva no cuenta contra el stock disponible */
  excluirPedidoId?: string;
}

@Injectable()
export class FacturasVentaService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FacturaVenta)
    private readonly facturaRepository: Repository<FacturaVenta>,
    @InjectRepository(ResolucionDian)
    private readonly resolucionRepository: Repository<ResolucionDian>,
  ) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async findAllFacturas(search?: string, clienteId?: string, anulada?: boolean): Promise<any[]> {
    const query = this.facturaRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('f.estado', 'e')
      .leftJoinAndSelect('f.resolucion', 'r')
      .leftJoinAndSelect('f.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .orderBy('f.fechaExpedicion', 'DESC')
      .addOrderBy('f.numeroVenta', 'DESC');

    if (search && search.trim() !== '') {
      query.andWhere(
        '(LOWER(f.numeroVenta) LIKE :search OR LOWER(t.razonSocial) LIKE :search OR LOWER(t.numeroDocumento) LIKE :search)',
        { search: `%${search.trim().toLowerCase()}%` },
      );
    }
    if (clienteId) query.andWhere('f.idCliente = :clienteId', { clienteId });
    if (anulada !== undefined) query.andWhere('f.anulada = :anulada', { anulada });

    const facturas = await query.getMany();
    const saldos = new Map(
      (
        await consultarSaldosVenta(this.dataSource.manager, {
          idContraparte: clienteId,
          incluirCastigadas: true,
        })
      ).map((s) => [s.idFactura, s]),
    );

    return facturas.map((f) => {
      const saldo = saldos.get(f.id);
      return {
        ...f,
        ...calcularTotales(f.detalles, f.retefuente),
        pagado: saldo?.pagado ?? 0,
        saldo: saldo?.saldo ?? 0,
        diasMora: saldo?.diasMora ?? 0,
      };
    });
  }

  async findFacturaById(id: string): Promise<any> {
    const factura = await this.facturaRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('t.ciudad', 'ci')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.emails', 'em')
      .leftJoinAndSelect('f.estado', 'e')
      .leftJoinAndSelect('f.resolucion', 'r')
      .leftJoinAndSelect('f.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .where('f.id = :id', { id })
      .getOne();

    if (!factura) throw new NotFoundException(`Factura de venta con ID ${id} no encontrada`);

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
      detalles: factura.detalles.map((d) => ({ ...d, ...calcularLinea(d) })),
      ...calcularTotales(factura.detalles, factura.retefuente),
      pagado: saldo?.pagado ?? 0,
      saldo: saldo?.saldo ?? 0,
      diasMora: saldo?.diasMora ?? 0,
      pagos: pagos.map((p: any) => ({ ...p, montoAplicado: Number(p.montoAplicado) })),
    };
  }

  // ─── Consecutivo DIAN ──────────────────────────────────────────────────────

  /**
   * Resolución vigente (fecha de vigencia no vencida), la más reciente.
   * Si no hay ninguna registrada se numera con prefijo FAC sin resolución.
   */
  private async resolucionVigente(db: EntityManager): Promise<ResolucionDian | null> {
    const [fila] = await db.query(
      `SELECT id_resolucion FROM resoluciones_dian
        WHERE vigente_hasta IS NULL OR vigente_hasta >= $1
        ORDER BY fecha_expedicion DESC
        LIMIT 1`,
      [fechaHoy()],
    );
    if (fila) return db.findOne(ResolucionDian, { where: { id: fila.id_resolucion } });

    const existentes = await db.count(ResolucionDian);
    if (existentes > 0) {
      throw new ConflictException(
        'No hay una resolución DIAN vigente. Registre una nueva resolución antes de facturar',
      );
    }
    return null;
  }

  private async calcularSiguienteNumero(db: EntityManager) {
    const resolucion = await this.resolucionVigente(db);
    const prefijo = resolucion?.prefijo || 'FAC';

    const [fila] = await db.query(
      `SELECT MAX(CAST(substring(numero_venta FROM '([0-9]+)$') AS BIGINT)) AS ultimo
         FROM facturas_venta
        WHERE ${resolucion ? 'id_resolucion = $1' : 'id_resolucion IS NULL'}`,
      resolucion ? [resolucion.id] : [],
    );

    const ultimo = Number(fila?.ultimo || 0);
    const desde = Number(resolucion?.rangoDesde || 1);
    const siguiente = Math.max(ultimo + 1, desde);

    if (resolucion && siguiente > Number(resolucion.rangoHasta)) {
      throw new ConflictException(
        `El rango de la resolución ${resolucion.numeroResolucion} está agotado (hasta ${resolucion.rangoHasta})`,
      );
    }

    return {
      resolucion,
      prefijo,
      consecutivo: siguiente,
      numero: `${prefijo}-${String(siguiente).padStart(6, '0')}`,
    };
  }

  async getSiguienteConsecutivo() {
    const info = await this.calcularSiguienteNumero(this.dataSource.manager);
    return {
      prefijo: info.prefijo,
      siguienteNumero: info.numero,
      resolucion: info.resolucion?.numeroResolucion || 'SIN_RESOLUCION',
      rangoHasta: info.resolucion ? Number(info.resolucion.rangoHasta) : null,
    };
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

  async createFactura(dto: CreateFacturaVentaDto, idUsuario?: string): Promise<any> {
    const id = await this.dataSource.transaction((manager) =>
      this.crearEnTransaccion(manager, dto, idUsuario),
    );
    return this.findFacturaById(id);
  }

  /**
   * Crea la factura dentro de una transacción ya abierta (la usa también la
   * facturación de pedidos). Valida stock y cupo, numera, descarga el
   * inventario a costo promedio y devuelve el id de la factura.
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
      throw new BadRequestException('El cliente está inactivo y no se le puede facturar');
    }

    await bloquearInventario(manager);
    // Serializa la numeración entre facturas simultáneas
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('crm_consecutivo_factura_venta'))`);

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

    const fechaExpedicion = dto.fechaExpedicion?.slice(0, 10) || fechaHoy();
    const fechaVencimiento =
      dto.fechaVencimiento?.slice(0, 10) || sumarDias(fechaExpedicion, Number(cliente.diasPlazo || 0));
    if (fechaVencimiento < fechaExpedicion) {
      throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de expedición');
    }

    const totales = calcularTotales(dto.items, dto.retefuente || 0);
    if (totales.total < 0) {
      throw new BadRequestException('La retención no puede superar el valor de la factura');
    }

    // Venta a crédito: el saldo pendiente más esta factura no puede superar el cupo
    if (fechaVencimiento > fechaExpedicion) {
      const pendientes = await consultarSaldosVenta(manager, {
        idContraparte: cliente.id,
        soloConSaldo: true,
      });
      const saldoActual = pendientes.reduce((acc, f) => acc + f.saldo, 0);
      const cupo = Number(cliente.cupoCredito || 0);
      if (saldoActual + totales.total > cupo) {
        throw new ConflictException(
          `Cupo de crédito insuficiente. Cupo: ${cupo}, saldo pendiente: ${redondear(saldoActual)}, factura: ${totales.total}`,
        );
      }
    }

    const numeracion = await this.calcularSiguienteNumero(manager);

    const factura = await manager.save(
      FacturaVenta,
      manager.create(FacturaVenta, {
        idCliente: dto.idCliente,
        idResolucion: numeracion.resolucion?.id,
        idEstado: estado.id,
        numeroVenta: numeracion.numero,
        fechaExpedicion,
        fechaVencimiento,
        retefuente: dto.retefuente || 0,
        anulada: false,
        idBodega,
        idUsuario,
        observaciones: dto.observaciones,
        // Con facturación electrónica activa la factura queda pendiente de envío a la DIAN
        estadoDian: process.env.FACTURACION_ELECTRONICA === 'true' ? 'PENDIENTE' : 'NO_APLICA',
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
        // El kardex registra la salida a costo, no a precio de venta (A10)
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
          }),
        );
      }
    }

    return factura.id;
  }

  async updateFactura(id: string, dto: UpdateFacturaVentaDto): Promise<any> {
    const factura = await this.facturaRepository.findOne({ where: { id } });
    if (!factura) throw new NotFoundException(`Factura de venta con ID ${id} no encontrada`);
    if (factura.anulada) {
      throw new BadRequestException('No se puede modificar una factura que ya ha sido anulada');
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

  async anularFactura(id: string, motivo: string, idUsuario?: string) {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);

      const factura = await manager.findOne(FacturaVenta, { where: { id } });
      if (!factura) throw new NotFoundException(`Factura de venta con ID ${id} no encontrada`);
      if (factura.anulada) throw new ConflictException('La factura ya se encuentra anulada');
      if (factura.estadoDian === 'ENVIADA' || factura.estadoDian === 'ACEPTADA') {
        throw new ConflictException(
          'La factura ya fue reportada a la DIAN: no se anula, se corrige con una nota crédito',
        );
      }
      if (factura.estado?.codigo === 'CASTIGADA') {
        throw new ConflictException('La factura fue castigada como cartera incobrable y no se puede anular');
      }

      // A3: no se anula una factura con pagos vigentes
      const [saldo] = await consultarSaldosVenta(manager, { id, incluirCastigadas: true });
      if (saldo && saldo.pagado > 0) {
        throw new ConflictException(
          `La factura tiene pagos aplicados por ${saldo.pagado}. Anule los pagos antes de anular la factura`,
        );
      }

      const estadoAnulada = await manager.findOne(EstadoFacturaVenta, { where: { codigo: 'ANULADA' } });
      if (!estadoAnulada) {
        throw new InternalServerErrorException('Falta el estado ANULADA en estados_factura_venta');
      }

      // A2: se devuelve exactamente lo que salió, a la misma bodega y al mismo costo
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
          [p.id_pedido, `Factura ${factura.numeroVenta} anulada: ${motivo}`],
        );
        await manager.query(
          `INSERT INTO historial_estados_pedido (id_pedido, estado, id_usuario, observacion)
           VALUES ($1, 'ANULADO', $2, $3)`,
          [p.id_pedido, idUsuario || null, `Factura ${factura.numeroVenta} anulada`],
        );
      }

      return {
        message: `Factura ${factura.numeroVenta} anulada exitosamente. Motivo: ${motivo}`,
        anulada: true,
        movimientosReversados: salidas.length,
      };
    });
  }

  async getFacturaPdf(id: string): Promise<never> {
    await this.findFacturaById(id);
    throw new NotImplementedException(
      'La generación del PDF de la factura aún no está implementada. Use GET /facturas-venta/{id} para obtener los datos',
    );
  }

  // ─── Resoluciones y Consecutivos ───────────────────────────────────────────

  async getResoluciones(): Promise<ResolucionDian[]> {
    return this.resolucionRepository.find({ order: { fechaExpedicion: 'DESC' } });
  }

  async getResolucionActiva(): Promise<ResolucionDian> {
    const resolucion = await this.resolucionVigente(this.dataSource.manager);
    if (!resolucion) throw new NotFoundException('No hay resoluciones DIAN registradas');
    return resolucion;
  }

  async createResolucion(dto: CreateResolucionDianDto): Promise<ResolucionDian> {
    if (dto.rangoHasta <= dto.rangoDesde) {
      throw new BadRequestException('rangoHasta debe ser mayor que rangoDesde');
    }
    if (dto.vigenteHasta && dto.vigenteHasta < dto.fechaExpedicion) {
      throw new BadRequestException('vigenteHasta no puede ser anterior a la fecha de expedición');
    }
    return this.resolucionRepository.save(this.resolucionRepository.create(dto));
  }

  async updateResolucion(id: string, dto: UpdateResolucionDianDto): Promise<ResolucionDian> {
    const res = await this.resolucionRepository.findOne({ where: { id } });
    if (!res) throw new NotFoundException(`Resolución con ID ${id} no encontrada`);
    Object.assign(res, dto);
    return this.resolucionRepository.save(res);
  }

  async getConsecutivos(): Promise<any[]> {
    const factura = await this.calcularSiguienteNumero(this.dataSource.manager).catch(() => null);
    const secuencia = async (nombre: string) => {
      const [fila] = await this.dataSource.query(`SELECT last_value, is_called FROM ${nombre}`);
      return fila?.is_called ? Number(fila.last_value) : 0;
    };
    const cotizaciones = await secuencia('seq_cotizaciones');
    const pedidos = await secuencia('seq_pedidos');

    return [
      {
        tipo: 'FACTURA_VENTA',
        prefijo: factura?.prefijo ?? null,
        resolucion: factura?.resolucion?.numeroResolucion ?? null,
        rangoDesde: factura?.resolucion ? Number(factura.resolucion.rangoDesde) : null,
        rangoHasta: factura?.resolucion ? Number(factura.resolucion.rangoHasta) : null,
        actual: factura ? factura.consecutivo - 1 : null,
        siguiente: factura?.consecutivo ?? null,
        vigenteHasta: factura?.resolucion?.vigenteHasta ?? null,
        disponible: !!factura,
      },
      { tipo: 'COTIZACION', prefijo: 'COT', actual: cotizaciones, siguiente: cotizaciones + 1 },
      { tipo: 'PEDIDO', prefijo: 'PED', actual: pedidos, siguiente: pedidos + 1 },
    ];
  }
}
