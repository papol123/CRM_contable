import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import {
  FacturaCompra,
  DetalleFacturaCompra,
  EstadoFacturaCompra,
} from '../../database/entities/factura-compra.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Proveedor } from '../../database/entities/proveedor.entity';
import { Producto } from '../../database/entities/producto.entity';
import { CreateFacturaCompraDto, UpdateFacturaCompraDto } from './dto/factura-compra.dto';
import { consultarSaldosCompra } from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { bloquearInventario, resolverBodega, saldoProducto } from '../../common/inventario/stock';
import { sumarDias } from '../../common/utils/fechas';

@Injectable()
export class ComprasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FacturaCompra)
    private readonly compraRepository: Repository<FacturaCompra>,
  ) {}

  private totales(detalles: DetalleFacturaCompra[]) {
    let subtotal = 0;
    let totalIva = 0;
    for (const d of detalles || []) {
      const linea = Number(d.cantidad) * Number(d.costoUnitario);
      subtotal += linea;
      totalIva += linea * (Number(d.pctIva || 0) / 100);
    }
    return {
      subtotal: redondear(subtotal),
      totalIva: redondear(totalIva),
      total: redondear(subtotal + totalIva),
    };
  }

  async findAll(search?: string, proveedorId?: string): Promise<any[]> {
    const query = this.compraRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('c.estado', 'e')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .orderBy('c.fechaEmision', 'DESC');

    if (search && search.trim() !== '') {
      query.andWhere('(LOWER(c.numeroFactura) LIKE :search OR LOWER(t.razonSocial) LIKE :search)', {
        search: `%${search.trim().toLowerCase()}%`,
      });
    }
    if (proveedorId) query.andWhere('c.idProveedor = :proveedorId', { proveedorId });

    const compras = await query.getMany();
    const saldos = new Map(
      (await consultarSaldosCompra(this.dataSource.manager, { idContraparte: proveedorId })).map(
        (s) => [s.idFacturaCompra, s],
      ),
    );

    return compras.map((c) => ({
      ...c,
      ...this.totales(c.detalles),
      pagado: saldos.get(c.id)?.pagado ?? 0,
      saldo: saldos.get(c.id)?.saldo ?? 0,
    }));
  }

  async findById(id: string): Promise<any> {
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

    const [saldo] = await consultarSaldosCompra(this.dataSource.manager, { id });
    return {
      ...compra,
      ...this.totales(compra.detalles),
      pagado: saldo?.pagado ?? 0,
      saldo: saldo?.saldo ?? 0,
    };
  }

  async create(dto: CreateFacturaCompraDto, idUsuario?: string): Promise<any> {
    const id = await this.dataSource.transaction(async (manager) => {
      const proveedor = await manager.findOne(Proveedor, { where: { id: dto.idProveedor } });
      if (!proveedor) throw new NotFoundException(`Proveedor con ID ${dto.idProveedor} no encontrado`);
      if (!proveedor.tercero?.activo) throw new BadRequestException('El proveedor está inactivo');

      await this.validarDuplicados(manager, dto.idProveedor, dto.numeroFactura, dto.cufe);

      const productos = await this.validarProductos(manager, dto.items.map((i) => i.idProducto));

      const estado = await manager.findOne(EstadoFacturaCompra, { where: { codigo: 'RECIBIDA' } });
      if (!estado) {
        throw new InternalServerErrorException('Falta el estado RECIBIDA en estados_factura_compra');
      }

      const fechaEmision = dto.fechaEmision.slice(0, 10);
      const fechaVencimiento =
        dto.fechaVencimiento?.slice(0, 10) || sumarDias(fechaEmision, Number(proveedor.diasPlazo || 0));
      if (fechaVencimiento < fechaEmision) {
        throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de emisión');
      }

      await bloquearInventario(manager);
      const idBodega = await resolverBodega(manager, dto.idBodega);

      const compra = await manager.save(
        FacturaCompra,
        manager.create(FacturaCompra, {
          idProveedor: dto.idProveedor,
          idEstado: estado.id,
          numeroFactura: dto.numeroFactura?.trim() || null,
          cufe: dto.cufe?.trim() || null,
          fechaEmision,
          fechaVencimiento,
          idBodega,
          idUsuario,
        }),
      );

      for (const item of dto.items) {
        await manager.save(
          DetalleFacturaCompra,
          manager.create(DetalleFacturaCompra, {
            idFacturaCompra: compra.id,
            idProducto: item.idProducto,
            cantidad: item.cantidad,
            costoUnitario: item.costoUnitario,
            pctIva: item.pctIva || 0,
          }),
        );

        if (productos.get(item.idProducto).manejaInventario) {
          await manager.save(
            MovimientoInventario,
            manager.create(MovimientoInventario, {
              idProducto: item.idProducto,
              idBodega,
              tipoMovimiento: 'ENTRADA',
              cantidad: item.cantidad,
              costoUnitario: item.costoUnitario,
              origenTabla: 'facturas_compra',
              origenId: compra.id,
            }),
          );
        }

        // Mantiene actualizado el último costo del proveedor para ese producto
        await manager.query(
          `INSERT INTO producto_proveedor (id_producto, id_proveedor, costo_actual, es_principal)
           VALUES ($1, $2, $3, NOT EXISTS (SELECT 1 FROM producto_proveedor WHERE id_producto = $1))
           ON CONFLICT (id_producto, id_proveedor) DO UPDATE SET costo_actual = EXCLUDED.costo_actual`,
          [item.idProducto, dto.idProveedor, item.costoUnitario],
        );
      }

      return compra.id;
    });
    return this.findById(id);
  }

  async update(id: string, dto: UpdateFacturaCompraDto): Promise<any> {
    const compra = await this.compraRepository.findOne({ where: { id } });
    if (!compra) throw new NotFoundException('Factura de compra no encontrada');
    if (compra.estado?.codigo === 'ANULADA') {
      throw new ConflictException('No se puede modificar una factura de compra anulada');
    }

    const cambios: Partial<FacturaCompra> = {};
    if (dto.numeroFactura !== undefined && dto.numeroFactura.trim() !== compra.numeroFactura) {
      await this.validarDuplicados(
        this.dataSource.manager,
        compra.idProveedor,
        dto.numeroFactura,
        undefined,
        id,
      );
      cambios.numeroFactura = dto.numeroFactura.trim();
    }
    if (dto.fechaVencimiento) {
      const fecha = dto.fechaVencimiento.slice(0, 10);
      if (fecha < String(compra.fechaEmision).slice(0, 10)) {
        throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de emisión');
      }
      cambios.fechaVencimiento = fecha;
    }
    if (Object.keys(cambios).length > 0) await this.compraRepository.update(id, cambios);
    return this.findById(id);
  }

  /** A4: anula la compra, saca del inventario lo que entró y cierra la cuenta por pagar. */
  async anular(id: string, motivo: string) {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);

      const compra = await manager.findOne(FacturaCompra, { where: { id } });
      if (!compra) throw new NotFoundException('Factura de compra no encontrada');
      if (compra.estado?.codigo === 'ANULADA') {
        throw new ConflictException('La factura de compra ya se encuentra anulada');
      }

      const [saldo] = await consultarSaldosCompra(manager, { id });
      if (saldo && saldo.pagado > 0) {
        throw new ConflictException(
          `La factura de compra tiene pagos aplicados por ${saldo.pagado}. Anule los pagos primero`,
        );
      }

      const entradas = await manager.find(MovimientoInventario, {
        where: { origenTabla: 'facturas_compra', origenId: id },
      });

      // La mercancía debe seguir en bodega para poder devolverla
      const porProductoBodega = new Map<string, { idProducto: string; idBodega: string; cantidad: number }>();
      for (const e of entradas) {
        const clave = `${e.idProducto}|${e.idBodega}`;
        const acumulado = porProductoBodega.get(clave) || { idProducto: e.idProducto, idBodega: e.idBodega, cantidad: 0 };
        acumulado.cantidad += Number(e.cantidad);
        porProductoBodega.set(clave, acumulado);
      }
      const faltantes: string[] = [];
      for (const { idProducto, idBodega, cantidad } of porProductoBodega.values()) {
        const disponible = await saldoProducto(manager, idProducto, idBodega);
        if (disponible < cantidad) {
          const producto = await manager.findOne(Producto, { where: { id: idProducto } });
          faltantes.push(`${producto?.codigo ?? idProducto} (en bodega ${disponible}, a devolver ${cantidad})`);
        }
      }
      if (faltantes.length > 0) {
        throw new ConflictException(
          `No se puede anular: parte de la mercancía ya salió del inventario: ${faltantes.join('; ')}`,
        );
      }

      for (const e of entradas) {
        await manager.save(
          MovimientoInventario,
          manager.create(MovimientoInventario, {
            idProducto: e.idProducto,
            idBodega: e.idBodega,
            tipoMovimiento: 'AJUSTE_SALIDA',
            cantidad: e.cantidad,
            costoUnitario: e.costoUnitario,
            origenTabla: 'anulacion_factura_compra',
            origenId: id,
          }),
        );
      }

      const estadoAnulada = await manager.findOne(EstadoFacturaCompra, { where: { codigo: 'ANULADA' } });
      if (!estadoAnulada) {
        throw new InternalServerErrorException('Falta el estado ANULADA en estados_factura_compra');
      }
      await manager.update(FacturaCompra, id, { idEstado: estadoAnulada.id, motivoAnulacion: motivo });

      return {
        id,
        anulada: true,
        movimientosReversados: entradas.length,
        mensaje: `Factura de compra ${compra.numeroFactura ?? id} anulada: ${motivo}`,
      };
    });
  }

  private async validarDuplicados(
    manager: EntityManager,
    idProveedor: string,
    numeroFactura?: string,
    cufe?: string,
    excluirId?: string,
  ) {
    const excluir = excluirId ? { id: Not(excluirId) } : {};
    if (numeroFactura?.trim()) {
      const existe = await manager.count(FacturaCompra, {
        where: { idProveedor, numeroFactura: numeroFactura.trim(), ...excluir },
      });
      if (existe) {
        throw new ConflictException(
          `El proveedor ya tiene registrada la factura número ${numeroFactura.trim()}`,
        );
      }
    }
    if (cufe?.trim()) {
      const existe = await manager.count(FacturaCompra, { where: { cufe: cufe.trim(), ...excluir } });
      if (existe) throw new ConflictException(`Ya existe una factura de compra con el CUFE ${cufe.trim()}`);
    }
  }

  private async validarProductos(manager: EntityManager, ids: string[]) {
    const unicos = [...new Set(ids)];
    const productos = await manager.find(Producto, { where: { id: In(unicos) } });
    if (productos.length !== unicos.length) {
      const encontrados = new Set(productos.map((p) => p.id));
      throw new NotFoundException(
        `Productos no encontrados: ${unicos.filter((i) => !encontrados.has(i)).join(', ')}`,
      );
    }
    return new Map(productos.map((p) => [p.id, p]));
  }
}
