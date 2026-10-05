import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Pedido,
  DetallePedido,
  HistorialEstadoPedido,
  EstadoPedido,
} from '../../database/entities/pedido.entity';
import { Cliente } from '../../database/entities/cliente.entity';
import {
  ConsultaPedidosDto,
  CreatePedidoDto,
  UpdateEstadoPedidoDto,
  FacturarPedidoDto,
} from './dto/ventas-documentos.dto';
import { ItemFacturaVentaDto } from './dto/factura-venta.dto';
import { calcularLinea, calcularTotales } from '../../common/documentos/totales';
import {
  bloquearInventario,
  resolverBodega,
  validarDisponibilidad,
} from '../../common/inventario/stock';
import { fechaHoy } from '../../common/utils/fechas';
import { FacturasVentaService } from './facturas-venta.service';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

/** Único avance permitido desde cada estado con PATCH /pedidos/{id}/estado. */
const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  RECIBIDO: 'EN_PROCESO',
  EN_PROCESO: 'ENVIADO',
  ENVIADO: 'ENTREGADO',
};

const ESTADOS_FINALES: EstadoPedido[] = ['FACTURADO', 'ANULADO'];

export interface DatosNuevoPedido {
  idCliente: string;
  idBodega?: string;
  observacion?: string;
  idCotizacion?: string;
  items: ItemFacturaVentaDto[];
}

@Injectable()
export class PedidosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Pedido)
    private readonly pedidoRepository: Repository<Pedido>,
    private readonly facturasService: FacturasVentaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros: ConsultaPedidosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.pedidoRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('p.bodega', 'b')
      .leftJoinAndSelect('p.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .orderBy('p.fecha', 'DESC')
      .addOrderBy('p.numero', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.estado) query.andWhere('p.estado = :estado', { estado: filtros.estado });
    if (filtros.clienteId) query.andWhere('p.idCliente = :idCliente', { idCliente: filtros.clienteId });

    const [pedidos, total] = await query.getManyAndCount();
    return paginado(pedidos.map((p) => ({ ...p, ...calcularTotales(p.detalles) })), total, pagina);
  }

  async findById(id: string, manager: EntityManager = this.dataSource.manager): Promise<any> {
    const pedido = await manager
      .getRepository(Pedido)
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('p.bodega', 'b')
      .leftJoinAndSelect('p.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .where('p.id = :id', { id })
      .getOne();
    if (!pedido) throw new NotFoundException(`Pedido con ID ${id} no encontrado`);

    return {
      ...pedido,
      detalles: pedido.detalles.map((d) => ({ ...d, ...calcularLinea(d) })),
      ...calcularTotales(pedido.detalles),
      trazabilidad: await this.findTrazabilidad(id, manager),
    };
  }

  async findTrazabilidad(id: string, manager: EntityManager = this.dataSource.manager) {
    const existe = await manager.count(Pedido, { where: { id } });
    if (!existe) throw new NotFoundException(`Pedido con ID ${id} no encontrado`);
    return manager.find(HistorialEstadoPedido, {
      where: { idPedido: id },
      order: { fecha: 'ASC' },
    });
  }

  async create(dto: CreatePedidoDto, idUsuario?: string): Promise<any> {
    const id = await this.dataSource.transaction((manager) =>
      this.crearEnTransaccion(manager, dto, idUsuario),
    );
    return this.findById(id);
  }

  /** Crea el pedido y reserva el stock. La usa también la conversión de cotizaciones. */
  async crearEnTransaccion(
    manager: EntityManager,
    datos: DatosNuevoPedido,
    idUsuario?: string,
  ): Promise<string> {
    if (!datos.items || datos.items.length === 0) {
      throw new BadRequestException('El pedido debe incluir al menos un producto');
    }
    const cliente = await manager.findOne(Cliente, { where: { id: datos.idCliente } });
    if (!cliente) throw new NotFoundException(`Cliente con ID ${datos.idCliente} no encontrado`);
    if (!cliente.tercero?.activo) throw new UnprocessableEntityException('El cliente está inactivo');

    await bloquearInventario(manager);
    const idBodega = await resolverBodega(manager, datos.idBodega);
    await validarDisponibilidad(manager, datos.items, idBodega);

    const [{ numero }] = await manager.query(
      `SELECT 'PED-' || LPAD(nextval('seq_pedidos')::text, 5, '0') AS numero`,
    );

    const pedido = await manager.save(
      Pedido,
      manager.create(Pedido, {
        numero,
        idCliente: datos.idCliente,
        idCotizacion: datos.idCotizacion,
        idBodega,
        idUsuario,
        fecha: fechaHoy(),
        estado: 'RECIBIDO',
        observacion: datos.observacion,
      }),
    );

    for (const item of datos.items) {
      await manager.save(
        DetallePedido,
        manager.create(DetallePedido, {
          idPedido: pedido.id,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          pctDescuento: item.pctDescuento || 0,
          pctIva: item.pctIva || 0,
        }),
      );
    }

    await this.registrarHistorial(manager, pedido.id, 'RECIBIDO', idUsuario, 'Pedido creado');
    return pedido.id;
  }

  async updateEstado(id: string, dto: UpdateEstadoPedidoDto, idUsuario?: string): Promise<any> {
    await this.dataSource.transaction(async (manager) => {
      const pedido = await this.obtenerParaCambio(manager, id);
      const permitido = SIGUIENTE_ESTADO[pedido.estado];
      if (dto.estado !== permitido) {
        throw new ConflictException(
          permitido
            ? `Transición no permitida: ${pedido.estado} → ${dto.estado}. El siguiente estado válido es ${permitido}`
            : `El pedido en estado ${pedido.estado} no admite más cambios de estado; solo facturar o anular`,
        );
      }
      await manager.update(Pedido, id, { estado: dto.estado });
      await this.registrarHistorial(manager, id, dto.estado, idUsuario, dto.observacion);
    });
    return this.findById(id);
  }

  /** Genera la remisión del pedido; su reserva no cuenta contra el stock disponible. */
  async facturar(id: string, dto: FacturarPedidoDto, actor?: Actor): Promise<any> {
    const idUsuario = actor?.id;
    const idFactura = await this.dataSource.transaction(async (manager) => {
      const pedido = await this.obtenerParaCambio(manager, id);

      const idFacturaVenta = await this.facturasService.crearEnTransaccion(
        manager,
        {
          idCliente: pedido.idCliente,
          idBodega: pedido.idBodega,
          fechaVencimiento: dto.fechaVencimiento,
          retefuente: dto.retefuente,
          observaciones: `Remisión del pedido ${pedido.numero}`,
          items: pedido.detalles.map((d) => ({
            idProducto: d.idProducto,
            cantidad: Number(d.cantidad),
            valorUnitario: Number(d.valorUnitario),
            pctDescuento: Number(d.pctDescuento),
            pctIva: Number(d.pctIva),
          })),
        },
        idUsuario,
        { excluirPedidoId: pedido.id },
      );

      await manager.update(Pedido, id, { estado: 'FACTURADO', idFacturaVenta });
      await this.registrarHistorial(manager, id, 'FACTURADO', idUsuario, 'Remisión generada');
      await this.auditoria.registrar(
        {
          idUsuario,
          accion: 'CREAR',
          recurso: 'facturas_venta',
          idRecurso: idFacturaVenta,
          valorNuevo: { origen: 'pedido', pedido: pedido.numero, ...dto },
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return idFacturaVenta;
    });
    return this.facturasService.findFacturaById(idFactura);
  }

  /** Anula el pedido y libera la reserva de stock (las reservas se calculan por estado). */
  async anular(id: string, motivo: string, actor?: Actor): Promise<any> {
    await this.dataSource.transaction(async (manager) => {
      const pedido = await this.obtenerParaCambio(manager, id);
      await manager.update(Pedido, id, { estado: 'ANULADO', motivoAnulacion: motivo });
      await this.registrarHistorial(manager, id, 'ANULADO', actor?.id, motivo);
      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'ANULAR',
          recurso: 'pedidos',
          idRecurso: id,
          valorAnterior: { numero: pedido.numero, estado: pedido.estado },
          valorNuevo: { estado: 'ANULADO', reservaLiberada: true },
          motivo,
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
    });
    return this.findById(id);
  }

  /** Carga el pedido bloqueando la fila y valida que no esté en un estado final. */
  private async obtenerParaCambio(manager: EntityManager, id: string): Promise<Pedido> {
    const [fila] = await manager.query(`SELECT id_pedido FROM pedidos WHERE id_pedido = $1 FOR UPDATE`, [id]);
    if (!fila) throw new NotFoundException(`Pedido con ID ${id} no encontrado`);
    const pedido = await manager.findOne(Pedido, { where: { id } });
    if (ESTADOS_FINALES.includes(pedido.estado)) {
      throw new ConflictException(`El pedido ${pedido.numero} ya está ${pedido.estado}`);
    }
    return pedido;
  }

  private async registrarHistorial(
    manager: EntityManager,
    idPedido: string,
    estado: EstadoPedido,
    idUsuario?: string,
    observacion?: string,
  ): Promise<void> {
    await manager.save(
      HistorialEstadoPedido,
      manager.create(HistorialEstadoPedido, { idPedido, estado, idUsuario, observacion }),
    );
  }
}
