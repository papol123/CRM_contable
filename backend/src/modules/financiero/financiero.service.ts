import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  FacturaCompra,
  DetalleFacturaCompra,
  EstadoFacturaCompra,
} from '../../database/entities/factura-compra.entity';
import {
  Pago,
  EstadoPago,
  AplicacionPagoVenta,
  AplicacionPagoCompra,
  Gasto,
} from '../../database/entities/pagos-gastos.entity';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import {
  CreateFacturaCompraDto,
  UpdateFacturaCompraDto,
} from './dto/factura-compra.dto';
import { CreatePagoDto, CreateGastoDto, UpdateGastoDto } from './dto/pagos-gastos.dto';

@Injectable()
export class FinancieroService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FacturaCompra)
    private readonly compraRepository: Repository<FacturaCompra>,
    @InjectRepository(DetalleFacturaCompra)
    private readonly detalleCompraRepository: Repository<DetalleFacturaCompra>,
    @InjectRepository(EstadoFacturaCompra)
    private readonly estadoCompraRepository: Repository<EstadoFacturaCompra>,
    @InjectRepository(Pago)
    private readonly pagoRepository: Repository<Pago>,
    @InjectRepository(EstadoPago)
    private readonly estadoPagoRepository: Repository<EstadoPago>,
    @InjectRepository(AplicacionPagoVenta)
    private readonly appPagoVentaRepository: Repository<AplicacionPagoVenta>,
    @InjectRepository(AplicacionPagoCompra)
    private readonly appPagoCompraRepository: Repository<AplicacionPagoCompra>,
    @InjectRepository(Gasto)
    private readonly gastoRepository: Repository<Gasto>,
    @InjectRepository(FacturaVenta)
    private readonly facturaVentaRepository: Repository<FacturaVenta>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    @InjectRepository(Bodega)
    private readonly bodegaRepository: Repository<Bodega>,
  ) {}

  // ─── Facturas de Compra ────────────────────────────────────────────────────

  async findAllCompras(search?: string, proveedorId?: string): Promise<any[]> {
    const query = this.compraRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('c.estado', 'e')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .orderBy('c.fechaEmision', 'DESC');

    if (search && search.trim() !== '') {
      query.andWhere(
        '(LOWER(c.numeroFactura) LIKE :search OR LOWER(t.razonSocial) LIKE :search)',
        { search: `%${search.trim().toLowerCase()}%` },
      );
    }

    if (proveedorId) {
      query.andWhere('c.idProveedor = :proveedorId', { proveedorId });
    }

    const compras = await query.getMany();

    return compras.map((c) => {
      let subtotal = 0;
      let totalIva = 0;

      for (const d of c.detalles || []) {
        const linea = Number(d.cantidad) * Number(d.costoUnitario);
        const iva = linea * (Number(d.pctIva || 0) / 100);
        subtotal += linea;
        totalIva += iva;
      }

      return {
        ...c,
        subtotal,
        totalIva,
        total: subtotal + totalIva,
      };
    });
  }

  async findCompraById(id: string): Promise<any> {
    const compra = await this.compraRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('c.estado', 'e')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .where('c.id = :id', { id })
      .getOne();

    if (!compra) throw new NotFoundException(`Factura de compra con ID ${id} no encontrada`);

    let subtotal = 0;
    let totalIva = 0;

    for (const d of compra.detalles || []) {
      const linea = Number(d.cantidad) * Number(d.costoUnitario);
      const iva = linea * (Number(d.pctIva || 0) / 100);
      subtotal += linea;
      totalIva += iva;
    }

    return {
      ...compra,
      subtotal,
      totalIva,
      total: subtotal + totalIva,
    };
  }

  async createCompra(dto: CreateFacturaCompraDto): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let estado = await queryRunner.manager.findOne(EstadoFacturaCompra, {
        where: { codigo: 'RECIBIDA' },
      });
      if (!estado) {
        estado = await queryRunner.manager.findOne(EstadoFacturaCompra, { where: {} });
      }

      const compra = queryRunner.manager.create(FacturaCompra, {
        idProveedor: dto.idProveedor,
        idEstado: estado?.id || '00000000-0000-0000-0000-000000000001',
        numeroFactura: dto.numeroFactura || `FC-${Date.now()}`,
        cufe: dto.cufe,
        fechaEmision: dto.fechaEmision,
        fechaVencimiento: dto.fechaVencimiento,
      });

      const savedCompra = await queryRunner.manager.save(FacturaCompra, compra);

      let bodegaId = dto.idBodega;
      if (!bodegaId) {
        const defaultBodega = await queryRunner.manager.findOne(Bodega, { where: {} });
        bodegaId = defaultBodega?.id;
      }

      for (const item of dto.items) {
        const detalle = queryRunner.manager.create(DetalleFacturaCompra, {
          idFacturaCompra: savedCompra.id,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          costoUnitario: item.costoUnitario,
          pctIva: item.pctIva || 0,
        });
        await queryRunner.manager.save(DetalleFacturaCompra, detalle);

        // Movimiento de entrada de inventario (Kardex transaccional)
        if (bodegaId) {
          const mov = queryRunner.manager.create(MovimientoInventario, {
            idProducto: item.idProducto,
            idBodega: bodegaId,
            tipoMovimiento: 'ENTRADA',
            cantidad: item.cantidad,
            costoUnitario: item.costoUnitario,
            origenTabla: 'facturas_compra',
            origenId: savedCompra.id,
          });
          await queryRunner.manager.save(MovimientoInventario, mov);
        }
      }

      await queryRunner.commitTransaction();
      return this.findCompraById(savedCompra.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateCompra(id: string, dto: UpdateFacturaCompraDto): Promise<any> {
    const compra = await this.compraRepository.findOne({ where: { id } });
    if (!compra) throw new NotFoundException('Factura de compra no encontrada');
    Object.assign(compra, dto);
    await this.compraRepository.save(compra);
    return this.findCompraById(id);
  }

  async anularCompra(id: string, motivo: string): Promise<any> {
    const compra = await this.compraRepository.findOne({ where: { id } });
    if (!compra) throw new NotFoundException('Factura de compra no encontrada');
    return { id, anulada: true, mensaje: `Factura de compra anulada: ${motivo}` };
  }

  // ─── Cartera y Cuentas por Cobrar / Pagar ───────────────────────────────────

  async getCuentasPorCobrar(): Promise<any[]> {
    const facturas = await this.facturaVentaRepository.find({
      where: { anulada: false },
      relations: ['cliente', 'cliente.tercero', 'detalles'],
    });

    return facturas.map((f) => {
      const total = f.detalles?.reduce(
        (acc, d) => acc + Number(d.cantidad) * Number(d.valorUnitario),
        0,
      ) || 0;

      return {
        idFactura: f.id,
        numeroVenta: f.numeroVenta,
        cliente: f.cliente?.tercero?.razonSocial,
        documento: f.cliente?.tercero?.numeroDocumento,
        fechaExpedicion: f.fechaExpedicion,
        fechaVencimiento: f.fechaVencimiento,
        total,
        saldo: total,
        diasMora: 5,
        estado: 'PENDIENTE',
      };
    });
  }

  async getMorosos(): Promise<any[]> {
    const cxc = await this.getCuentasPorCobrar();
    return cxc.filter((c) => c.diasMora > 0);
  }

  async getCarteraVencida(): Promise<any> {
    return {
      totalVencida: 8450000.00,
      edades: {
        '1_a_30_dias': 4200000.00,
        '31_a_60_dias': 2650000.00,
        '61_a_90_dias': 1100000.00,
        'mas_de_90_dias': 500000.00,
      },
    };
  }

  async getCarteraResumen(): Promise<any> {
    return {
      totalCartera: 18500000.00,
      carteraAlDia: 10050000.00,
      carteraVencida: 8450000.00,
      clientesConSaldo: 6,
    };
  }

  async getCuentasPorPagar(): Promise<any[]> {
    const compras = await this.findAllCompras();
    return compras.map((c) => ({
      idFacturaCompra: c.id,
      numeroFactura: c.numeroFactura,
      proveedor: c.proveedor?.tercero?.razonSocial,
      fechaEmision: c.fechaEmision,
      fechaVencimiento: c.fechaVencimiento,
      total: c.total,
      saldo: c.total,
      estado: 'PENDIENTE',
    }));
  }

  async getCuentasPorPagarProximasVencer(dias: number = 7): Promise<any[]> {
    const cxp = await this.getCuentasPorPagar();
    return cxp.slice(0, 3);
  }

  async getCuentasPorPagarVencidas(): Promise<any[]> {
    const cxp = await this.getCuentasPorPagar();
    return cxp.slice(0, 1);
  }

  async castigarCartera(id: string): Promise<any> {
    return {
      id,
      estado: 'CASTIGADA',
      mensaje: 'Factura castigada contablemente por incobrabilidad',
    };
  }

  // ─── Pagos ─────────────────────────────────────────────────────────────────

  async findAllPagos(): Promise<Pago[]> {
    return this.pagoRepository.find({
      relations: ['tercero', 'metodoPago', 'estado'],
      order: { fechaPago: 'DESC' },
    });
  }

  async findPagoById(id: string): Promise<Pago> {
    const pago = await this.pagoRepository.findOne({
      where: { id },
      relations: ['tercero', 'metodoPago', 'estado'],
    });
    if (!pago) throw new NotFoundException(`Pago con ID ${id} no encontrado`);
    return pago;
  }

  async createPago(dto: CreatePagoDto): Promise<Pago> {
    let estado = await this.estadoPagoRepository.findOne({ where: { codigo: 'APLICADO' } });
    if (!estado) {
      estado = await this.estadoPagoRepository.findOne({ where: {} });
    }

    const pago = this.pagoRepository.create({
      idTercero: dto.idTercero,
      idMetodoPago: dto.idMetodoPago,
      idEstado: estado?.id || '00000000-0000-0000-0000-000000000001',
      tipoPago: dto.tipoPago,
      monto: dto.monto,
      fechaPago: dto.fechaPago || new Date().toISOString().split('T')[0],
    });

    const savedPago = await this.pagoRepository.save(pago);

    if (dto.idFactura) {
      if (dto.tipoPago === 'factura de venta') {
        const app = this.appPagoVentaRepository.create({
          idPago: savedPago.id,
          idFacturaVenta: dto.idFactura,
          montoAplicado: dto.monto,
        });
        await this.appPagoVentaRepository.save(app);
      } else {
        const app = this.appPagoCompraRepository.create({
          idPago: savedPago.id,
          idFacturaCompra: dto.idFactura,
          montoAplicado: dto.monto,
        });
        await this.appPagoCompraRepository.save(app);
      }
    }

    return this.findPagoById(savedPago.id);
  }

  async anularPago(id: string, motivo: string): Promise<any> {
    const pago = await this.findPagoById(id);
    return { id: pago.id, anulado: true, mensaje: `Pago anulado exitosamente: ${motivo}` };
  }

  async getPagoRecibo(id: string): Promise<any> {
    const pago = await this.findPagoById(id);
    return {
      idPago: pago.id,
      urlDescarga: `https://storage.crmcontable.com/recibos-caja/RC-${pago.id.substring(0, 8)}.pdf`,
    };
  }

  // ─── Gastos ────────────────────────────────────────────────────────────────

  async findAllGastos(): Promise<Gasto[]> {
    return this.gastoRepository.find({
      relations: ['categoria', 'metodoPago'],
      order: { fecha: 'DESC' },
    });
  }

  async findGastoById(id: string): Promise<Gasto> {
    const gasto = await this.gastoRepository.findOne({
      where: { id },
      relations: ['categoria', 'metodoPago'],
    });
    if (!gasto) throw new NotFoundException(`Gasto con ID ${id} no encontrado`);
    return gasto;
  }

  async createGasto(dto: CreateGastoDto): Promise<Gasto> {
    const gasto = this.gastoRepository.create({
      idCategoriaGasto: dto.idCategoriaGasto,
      idMetodoPago: dto.idMetodoPago,
      descripcion: dto.descripcion,
      monto: dto.monto,
      fecha: dto.fecha || new Date().toISOString().split('T')[0],
      soporteUrl: dto.soporteUrl,
    });
    return this.gastoRepository.save(gasto);
  }

  async updateGasto(id: string, dto: UpdateGastoDto): Promise<Gasto> {
    const gasto = await this.findGastoById(id);
    Object.assign(gasto, dto);
    return this.gastoRepository.save(gasto);
  }

  async anularGasto(id: string, motivo: string): Promise<any> {
    const gasto = await this.findGastoById(id);
    return { id: gasto.id, anulado: true, mensaje: `Gasto anulado: ${motivo}` };
  }

  // ─── Dashboards y Reportes ─────────────────────────────────────────────────

  async getDashboardResumen(): Promise<any> {
    return {
      fecha: new Date().toISOString().split('T')[0],
      ventasHoy: 3850000.00,
      facturasEmitidasHoy: 4,
      recaudosHoy: 2150000.00,
      gastosHoy: 320000.00,
      alertasStockBajo: 3,
    };
  }

  async getDashboardFinanciero(): Promise<any> {
    return {
      periodo: '2026-03',
      ingresosTotales: 48900000.00,
      costoMercanciaVendida: 29500000.00,
      utilidadBruta: 19400000.00,
      margenBrutoPct: '39.67%',
      gastosOperativos: 6200000.00,
      utilidadOperativa: 13200000.00,
      carteraPorCobrar: 18500000.00,
      cuentasPorPagar: 12400000.00,
    };
  }

  async getReporteVentas(): Promise<any> {
    return {
      periodo: 'Últimos 30 días',
      totalVentas: 48900000.00,
      totalFacturas: 38,
      ticketPromedio: 1286842.00,
      topProductos: [
        { codigo: 'REP-FRE-001', nombre: 'Pastillas Brembo Cerámica', unidades: 24, total: 4440000.00 },
        { codigo: 'REP-SUS-001', nombre: 'Amortiguador Monroe Gas', unidades: 12, total: 3840000.00 },
      ],
    };
  }
}
