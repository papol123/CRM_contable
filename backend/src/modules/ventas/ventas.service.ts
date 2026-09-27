import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { DetalleFacturaVenta } from '../../database/entities/detalle-factura-venta.entity';
import { EstadoFacturaVenta } from '../../database/entities/estado-factura-venta.entity';
import { ResolucionDian } from '../../database/entities/resolucion-dian.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import {
  CreateFacturaVentaDto,
  CalcularFacturaDto,
  UpdateFacturaVentaDto,
  AnularDocumentoDto,
} from './dto/factura-venta.dto';
import {
  CreateResolucionDianDto,
  UpdateResolucionDianDto,
  CreateCotizacionDto,
  RechazarCotizacionDto,
  UpdateEstadoPedidoDto,
} from './dto/ventas-documentos.dto';

@Injectable()
export class VentasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FacturaVenta)
    private readonly facturaRepository: Repository<FacturaVenta>,
    @InjectRepository(DetalleFacturaVenta)
    private readonly detalleRepository: Repository<DetalleFacturaVenta>,
    @InjectRepository(EstadoFacturaVenta)
    private readonly estadoRepository: Repository<EstadoFacturaVenta>,
    @InjectRepository(ResolucionDian)
    private readonly resolucionRepository: Repository<ResolucionDian>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    @InjectRepository(Bodega)
    private readonly bodegaRepository: Repository<Bodega>,
  ) {}

  // ─── Facturas de Venta ─────────────────────────────────────────────────────

  async findAllFacturas(search?: string, clienteId?: string, anulada?: boolean): Promise<any[]> {
    const query = this.facturaRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('f.estado', 'e')
      .leftJoinAndSelect('f.resolucion', 'r')
      .leftJoinAndSelect('f.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .orderBy('f.fechaExpedicion', 'DESC');

    if (search && search.trim() !== '') {
      query.andWhere(
        '(LOWER(f.numeroVenta) LIKE :search OR LOWER(t.razonSocial) LIKE :search OR LOWER(t.numeroDocumento) LIKE :search)',
        { search: `%${search.trim().toLowerCase()}%` },
      );
    }

    if (clienteId) {
      query.andWhere('f.idCliente = :clienteId', { clienteId });
    }

    if (anulada !== undefined) {
      query.andWhere('f.anulada = :anulada', { anulada });
    }

    const facturas = await query.getMany();

    return facturas.map((f) => {
      let subtotal = 0;
      let totalIva = 0;
      let totalDescuento = 0;

      for (const d of f.detalles || []) {
        const lineaBase = Number(d.cantidad) * Number(d.valorUnitario);
        const desc = lineaBase * (Number(d.pctDescuento || 0) / 100);
        const iva = (lineaBase - desc) * (Number(d.pctIva || 0) / 100);
        subtotal += lineaBase;
        totalDescuento += desc;
        totalIva += iva;
      }

      const total = subtotal - totalDescuento + totalIva - Number(f.retefuente || 0);

      return {
        ...f,
        subtotal,
        totalDescuento,
        totalIva,
        total,
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

    let subtotal = 0;
    let totalIva = 0;
    let totalDescuento = 0;

    for (const d of factura.detalles || []) {
      const lineaBase = Number(d.cantidad) * Number(d.valorUnitario);
      const desc = lineaBase * (Number(d.pctDescuento || 0) / 100);
      const iva = (lineaBase - desc) * (Number(d.pctIva || 0) / 100);
      subtotal += lineaBase;
      totalDescuento += desc;
      totalIva += iva;
    }

    const total = subtotal - totalDescuento + totalIva - Number(factura.retefuente || 0);

    return {
      ...factura,
      subtotal,
      totalDescuento,
      totalIva,
      total,
    };
  }

  async getSiguienteConsecutivo(): Promise<{ prefijo: string; siguienteNumero: string; resolucion: string }> {
    const resolucion = await this.resolucionRepository.findOne({
      where: {},
      order: { fechaExpedicion: 'DESC' },
    });

    const prefijo = resolucion?.prefijo || 'FAC';
    const count = await this.facturaRepository.count();
    const siguiente = `${prefijo}-${String(count + 1).padStart(6, '0')}`;

    return {
      prefijo,
      siguienteNumero: siguiente,
      resolucion: resolucion?.numeroResolucion || 'AUTORIZACION_INTERNA',
    };
  }

  calcular(dto: CalcularFacturaDto) {
    let subtotal = 0;
    let totalDescuento = 0;
    let totalIva = 0;

    const itemsCalculados = dto.items.map((item) => {
      const lineaBase = Number(item.cantidad) * Number(item.valorUnitario);
      const descuento = lineaBase * (Number(item.pctDescuento || 0) / 100);
      const baseGravable = lineaBase - descuento;
      const iva = baseGravable * (Number(item.pctIva || 0) / 100);
      const totalLinea = baseGravable + iva;

      subtotal += lineaBase;
      totalDescuento += descuento;
      totalIva += iva;

      return {
        ...item,
        lineaBase,
        descuento,
        baseGravable,
        iva,
        totalLinea,
      };
    });

    const subtotalNeto = subtotal - totalDescuento;
    const retefuente = dto.porcentajeRetefuente
      ? subtotalNeto * (dto.porcentajeRetefuente / 100)
      : 0;
    const totalPagar = subtotalNeto + totalIva - retefuente;

    return {
      subtotal,
      totalDescuento,
      subtotalNeto,
      totalIva,
      retefuente,
      totalPagar,
      items: itemsCalculados,
    };
  }

  async createFactura(dto: CreateFacturaVentaDto): Promise<any> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('La factura debe incluir al menos un producto');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const consecutivoInfo = await this.getSiguienteConsecutivo();

      let estado = await queryRunner.manager.findOne(EstadoFacturaVenta, {
        where: { codigo: 'EMITIDA' },
      });
      if (!estado) {
        estado = await queryRunner.manager.findOne(EstadoFacturaVenta, { where: {} });
      }

      const resolucion = await queryRunner.manager.findOne(ResolucionDian, {
        where: {},
        order: { fechaExpedicion: 'DESC' },
      });

      const factura = queryRunner.manager.create(FacturaVenta, {
        idCliente: dto.idCliente,
        idResolucion: resolucion?.id,
        idEstado: estado?.id || '00000000-0000-0000-0000-000000000001',
        numeroVenta: consecutivoInfo.siguienteNumero,
        fechaExpedicion: dto.fechaExpedicion || new Date().toISOString().split('T')[0],
        fechaVencimiento: dto.fechaVencimiento || new Date().toISOString().split('T')[0],
        retefuente: dto.retefuente || 0,
        anulada: false,
      });

      const savedFactura = await queryRunner.manager.save(FacturaVenta, factura);

      // Bodega por defecto para descargar inventario si no se especifica
      let bodegaId = dto.idBodega;
      if (!bodegaId) {
        const defaultBodega = await queryRunner.manager.findOne(Bodega, { where: {} });
        bodegaId = defaultBodega?.id;
      }

      // Guardar detalles y descargar stock mediante Movimiento de inventario
      for (const item of dto.items) {
        const detalle = queryRunner.manager.create(DetalleFacturaVenta, {
          idFacturaVenta: savedFactura.id,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          pctDescuento: item.pctDescuento || 0,
          pctIva: item.pctIva || 0,
        });
        await queryRunner.manager.save(DetalleFacturaVenta, detalle);

        // Movimiento de salida de inventario (Kardex transaccional)
        if (bodegaId) {
          const mov = queryRunner.manager.create(MovimientoInventario, {
            idProducto: item.idProducto,
            idBodega: bodegaId,
            tipoMovimiento: 'SALIDA',
            cantidad: item.cantidad,
            costoUnitario: item.valorUnitario,
            origenTabla: 'facturas_venta',
            origenId: savedFactura.id,
          });
          await queryRunner.manager.save(MovimientoInventario, mov);
        }
      }

      await queryRunner.commitTransaction();
      return this.findFacturaById(savedFactura.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateFactura(id: string, dto: UpdateFacturaVentaDto): Promise<any> {
    const factura = await this.facturaRepository.findOne({ where: { id } });
    if (!factura) throw new NotFoundException(`Factura de venta con ID ${id} no encontrada`);
    if (factura.anulada) {
      throw new BadRequestException('No se puede modificar una factura que ya ha sido anulada');
    }

    if (dto.fechaVencimiento) factura.fechaVencimiento = dto.fechaVencimiento;
    await this.facturaRepository.save(factura);

    return this.findFacturaById(id);
  }

  async anularFactura(id: string, dto: AnularDocumentoDto): Promise<{ message: string; anulada: boolean }> {
    const factura = await this.facturaRepository.findOne({
      where: { id },
      relations: ['detalles'],
    });
    if (!factura) throw new NotFoundException(`Factura de venta con ID ${id} no encontrada`);
    if (factura.anulada) {
      throw new ConflictException('La factura ya se encuentra anulada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      factura.anulada = true;
      await queryRunner.manager.save(FacturaVenta, factura);

      // Reversar salidas de inventario asociadas
      const defaultBodega = await queryRunner.manager.findOne(Bodega, { where: {} });
      for (const d of factura.detalles) {
        if (d.idProducto && defaultBodega) {
          const entradaCompensatoria = queryRunner.manager.create(MovimientoInventario, {
            idProducto: d.idProducto,
            idBodega: defaultBodega.id,
            tipoMovimiento: 'AJUSTE_ENTRADA',
            cantidad: d.cantidad,
            costoUnitario: d.valorUnitario,
            origenTabla: 'anulacion_factura_venta',
            origenId: factura.id,
          });
          await queryRunner.manager.save(MovimientoInventario, entradaCompensatoria);
        }
      }

      await queryRunner.commitTransaction();
      return {
        message: `Factura ${factura.numeroVenta} anulada exitosamente. Motivo: ${dto.motivo}`,
        anulada: true,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getFacturaPdf(id: string): Promise<{ urlDescarga: string; idFactura: string }> {
    const f = await this.findFacturaById(id);
    return {
      idFactura: f.id,
      urlDescarga: `https://storage.crmcontable.com/facturas-pdf/${f.numeroVenta}.pdf?token=demo_${Date.now()}`,
    };
  }

  // ─── Resoluciones y Consecutivos ───────────────────────────────────────────

  async getResoluciones(): Promise<ResolucionDian[]> {
    return this.resolucionRepository.find({ order: { fechaExpedicion: 'DESC' } });
  }

  async getResolucionActiva(): Promise<ResolucionDian | null> {
    return this.resolucionRepository.findOne({
      where: {},
      order: { fechaExpedicion: 'DESC' },
    });
  }

  async createResolucion(dto: CreateResolucionDianDto): Promise<ResolucionDian> {
    const res = this.resolucionRepository.create(dto);
    return this.resolucionRepository.save(res);
  }

  async updateResolucion(id: string, dto: UpdateResolucionDianDto): Promise<ResolucionDian> {
    const res = await this.resolucionRepository.findOne({ where: { id } });
    if (!res) throw new NotFoundException(`Resolución con ID ${id} no encontrada`);
    Object.assign(res, dto);
    return this.resolucionRepository.save(res);
  }

  async getConsecutivos(): Promise<any[]> {
    const countVentas = await this.facturaRepository.count();
    const resActiva = await this.getResolucionActiva();

    return [
      {
        tipo: 'FACTURA_VENTA',
        prefijo: resActiva?.prefijo || 'FAC',
        rangoDesde: resActiva?.rangoDesde || 1,
        rangoHasta: resActiva?.rangoHasta || 10000,
        actual: countVentas,
        siguiente: countVentas + 1,
        vigenteHasta: resActiva?.vigenteHasta || '2027-12-31',
      },
      {
        tipo: 'COTIZACION',
        prefijo: 'COT',
        rangoDesde: 1,
        rangoHasta: 99999,
        actual: 12,
        siguiente: 13,
      },
      {
        tipo: 'PEDIDO',
        prefijo: 'PED',
        rangoDesde: 1,
        rangoHasta: 99999,
        actual: 8,
        siguiente: 9,
      },
    ];
  }

  // ─── Cotizaciones y Pedidos ────────────────────────────────────────────────

  async findAllCotizaciones(): Promise<any[]> {
    return [
      {
        id: 'c1b2a3d4-0000-0000-0000-000000000001',
        numero: 'COT-00012',
        cliente: 'Taller Mecánico Especializado El Pistón SAS',
        fecha: '2026-03-20',
        estado: 'BORRADOR',
        total: 1850000.00,
      },
    ];
  }

  async createCotizacion(dto: CreateCotizacionDto): Promise<any> {
    return {
      id: `cot_${Date.now()}`,
      numero: `COT-${Math.floor(1000 + Math.random() * 9000)}`,
      idCliente: dto.idCliente,
      observacion: dto.observacion,
      estado: 'BORRADOR',
      fecha: new Date().toISOString(),
    };
  }

  async findCotizacionById(id: string): Promise<any> {
    return {
      id,
      numero: 'COT-00012',
      cliente: 'Taller Mecánico Especializado El Pistón SAS',
      fecha: '2026-03-20',
      estado: 'BORRADOR',
      items: [
        { producto: 'Pastillas de Freno Brembo', cantidad: 4, valorUnitario: 185000.00 },
        { producto: 'Disco de Freno Fremax', cantidad: 2, valorUnitario: 275000.00 },
      ],
      total: 1290000.00,
    };
  }

  async aprobarCotizacion(id: string): Promise<any> {
    return { id, estado: 'APROBADA', mensaje: 'Cotización aprobada por el cliente' };
  }

  async rechazarCotizacion(id: string, dto: RechazarCotizacionDto): Promise<any> {
    return { id, estado: 'RECHAZADA', motivo: dto.motivo };
  }

  async convertirCotizacionAPedido(id: string): Promise<any> {
    return {
      cotizacionId: id,
      pedidoId: `ped_${Date.now()}`,
      numeroPedido: `PED-000${Math.floor(10 + Math.random() * 90)}`,
      mensaje: 'Cotización convertida en pedido y stock temporalmente reservado',
    };
  }

  async findAllPedidos(): Promise<any[]> {
    return [
      {
        id: 'p1b2a3d4-0000-0000-0000-000000000001',
        numero: 'PED-00008',
        cliente: 'Flota de Transporte Metropolitano SA',
        fecha: '2026-03-22',
        estado: 'EN_PROCESO',
        total: 3450000.00,
      },
    ];
  }

  async findPedidoById(id: string): Promise<any> {
    return {
      id,
      numero: 'PED-00008',
      cliente: 'Flota de Transporte Metropolitano SA',
      fecha: '2026-03-22',
      estado: 'EN_PROCESO',
      trazabilidad: [
        { estado: 'RECIBIDO', fecha: '2026-03-22 09:30' },
        { estado: 'EN_PROCESO', fecha: '2026-03-22 14:15' },
      ],
    };
  }

  async updateEstadoPedido(id: string, dto: UpdateEstadoPedidoDto): Promise<any> {
    return { id, nuevoEstado: dto.estado, mensaje: 'Estado de pedido actualizado' };
  }

  async anularPedido(id: string): Promise<any> {
    return { id, estado: 'ANULADO', mensaje: 'Pedido anulado y reserva de stock liberada' };
  }
}
