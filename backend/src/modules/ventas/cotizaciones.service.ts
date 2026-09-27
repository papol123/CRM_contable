import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Cotizacion, DetalleCotizacion } from '../../database/entities/cotizacion.entity';
import { Cliente } from '../../database/entities/cliente.entity';
import { Producto } from '../../database/entities/producto.entity';
import {
  CreateCotizacionDto,
  UpdateCotizacionDto,
  ConvertirCotizacionDto,
} from './dto/ventas-documentos.dto';
import { ItemFacturaVentaDto } from './dto/factura-venta.dto';
import { calcularLinea, calcularTotales } from '../../common/documentos/totales';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { PedidosService } from './pedidos.service';

const DIAS_VIGENCIA_POR_DEFECTO = 15;

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cotizacion)
    private readonly cotizacionRepository: Repository<Cotizacion>,
    private readonly pedidosService: PedidosService,
  ) {}

  async findAll(estado?: string, idCliente?: string): Promise<any[]> {
    const query = this.cotizacionRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.cliente', 'cl')
      .innerJoinAndSelect('cl.tercero', 't')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.numero', 'DESC');

    if (estado) query.andWhere('c.estado = :estado', { estado: estado.toUpperCase() });
    if (idCliente) query.andWhere('c.idCliente = :idCliente', { idCliente });

    const cotizaciones = await query.getMany();
    return cotizaciones.map((c) => this.conTotales(c));
  }

  async findById(id: string): Promise<any> {
    return this.conTotales(await this.obtener(id));
  }

  async create(dto: CreateCotizacionDto, idUsuario?: string): Promise<any> {
    const id = await this.dataSource.transaction(async (manager) => {
      const cliente = await manager.findOne(Cliente, { where: { id: dto.idCliente } });
      if (!cliente) throw new NotFoundException(`Cliente con ID ${dto.idCliente} no encontrado`);
      if (!cliente.tercero?.activo) throw new BadRequestException('El cliente está inactivo');

      const fecha = fechaHoy();
      const vigenteHasta = dto.vigenteHasta?.slice(0, 10) || sumarDias(fecha, DIAS_VIGENCIA_POR_DEFECTO);
      if (vigenteHasta < fecha) {
        throw new BadRequestException('La vigencia no puede ser anterior a hoy');
      }

      const [{ numero }] = await manager.query(
        `SELECT 'COT-' || LPAD(nextval('seq_cotizaciones')::text, 5, '0') AS numero`,
      );

      const cotizacion = await manager.save(
        Cotizacion,
        manager.create(Cotizacion, {
          numero,
          idCliente: dto.idCliente,
          idUsuario,
          fecha,
          vigenteHasta,
          estado: 'BORRADOR',
          observacion: dto.observacion,
        }),
      );
      await this.guardarItems(manager, cotizacion.id, dto.items || []);
      return cotizacion.id;
    });
    return this.findById(id);
  }

  async update(id: string, dto: UpdateCotizacionDto): Promise<any> {
    await this.dataSource.transaction(async (manager) => {
      const cotizacion = await this.obtener(id, manager);
      if (cotizacion.estado !== 'BORRADOR') {
        throw new ConflictException(`Solo se editan cotizaciones en BORRADOR (estado actual: ${cotizacion.estado})`);
      }
      const cambios: Partial<Cotizacion> = {};
      if (dto.observacion !== undefined) cambios.observacion = dto.observacion;
      if (dto.vigenteHasta) cambios.vigenteHasta = dto.vigenteHasta.slice(0, 10);
      if (Object.keys(cambios).length > 0) await manager.update(Cotizacion, id, cambios);

      if (dto.items) {
        await manager.delete(DetalleCotizacion, { idCotizacion: id });
        await this.guardarItems(manager, id, dto.items);
      }
    });
    return this.findById(id);
  }

  async aprobar(id: string): Promise<any> {
    const cotizacion = await this.obtener(id);
    this.validarVigenteConItems(cotizacion, ['BORRADOR']);
    await this.cotizacionRepository.update(id, { estado: 'APROBADA' });
    return this.findById(id);
  }

  async rechazar(id: string, motivo: string): Promise<any> {
    const cotizacion = await this.obtener(id);
    if (!['BORRADOR', 'APROBADA'].includes(cotizacion.estado)) {
      throw new ConflictException(`No se puede rechazar una cotización en estado ${cotizacion.estado}`);
    }
    await this.cotizacionRepository.update(id, { estado: 'RECHAZADA', motivoRechazo: motivo });
    return this.findById(id);
  }

  /** Genera un pedido con los items de la cotización y reserva el stock. */
  async convertirAPedido(id: string, dto: ConvertirCotizacionDto, idUsuario?: string): Promise<any> {
    const idPedido = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT 1 FROM cotizaciones WHERE id_cotizacion = $1 FOR UPDATE`, [id]);
      const cotizacion = await this.obtener(id, manager);
      this.validarVigenteConItems(cotizacion, ['BORRADOR', 'APROBADA']);

      const pedidoId = await this.pedidosService.crearEnTransaccion(
        manager,
        {
          idCliente: cotizacion.idCliente,
          idBodega: dto.idBodega,
          idCotizacion: cotizacion.id,
          observacion: `Generado desde la cotización ${cotizacion.numero}`,
          items: cotizacion.detalles.map((d) => ({
            idProducto: d.idProducto,
            cantidad: Number(d.cantidad),
            valorUnitario: Number(d.valorUnitario),
            pctDescuento: Number(d.pctDescuento),
            pctIva: Number(d.pctIva),
          })),
        },
        idUsuario,
      );
      await manager.update(Cotizacion, id, { estado: 'CONVERTIDA' });
      return pedidoId;
    });

    return {
      cotizacion: await this.findById(id),
      pedido: await this.pedidosService.findById(idPedido),
    };
  }

  async getPdf(id: string): Promise<never> {
    await this.obtener(id);
    throw new NotImplementedException(
      'La generación del PDF de la cotización aún no está implementada. Use GET /cotizaciones/{id} para obtener los datos',
    );
  }

  private validarVigenteConItems(cotizacion: Cotizacion, estadosPermitidos: string[]) {
    if (!estadosPermitidos.includes(cotizacion.estado)) {
      throw new ConflictException(
        `Operación no permitida para una cotización en estado ${cotizacion.estado}`,
      );
    }
    if (!cotizacion.detalles || cotizacion.detalles.length === 0) {
      throw new ConflictException('La cotización no tiene productos');
    }
    if (cotizacion.vigenteHasta && String(cotizacion.vigenteHasta).slice(0, 10) < fechaHoy()) {
      throw new ConflictException(`La cotización venció el ${cotizacion.vigenteHasta}`);
    }
  }

  private async obtener(id: string, manager: EntityManager = this.dataSource.manager): Promise<Cotizacion> {
    const cotizacion = await manager.findOne(Cotizacion, { where: { id } });
    if (!cotizacion) throw new NotFoundException(`Cotización con ID ${id} no encontrada`);
    return cotizacion;
  }

  private async guardarItems(manager: EntityManager, idCotizacion: string, items: ItemFacturaVentaDto[]) {
    if (items.length === 0) return;
    const ids = [...new Set(items.map((i) => i.idProducto))];
    const productos = await manager.find(Producto, { where: { id: In(ids) } });
    if (productos.length !== ids.length) {
      throw new NotFoundException('Uno o más productos de la cotización no existen');
    }
    const inactivos = productos.filter((p) => !p.activo);
    if (inactivos.length > 0) {
      throw new BadRequestException(`Productos inactivos: ${inactivos.map((p) => p.codigo).join(', ')}`);
    }

    for (const item of items) {
      await manager.save(
        DetalleCotizacion,
        manager.create(DetalleCotizacion, {
          idCotizacion,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          pctDescuento: item.pctDescuento || 0,
          pctIva: item.pctIva || 0,
        }),
      );
    }
  }

  private conTotales(c: Cotizacion) {
    return {
      ...c,
      detalles: (c.detalles || []).map((d) => ({ ...d, ...calcularLinea(d) })),
      ...calcularTotales(c.detalles || []),
    };
  }
}
