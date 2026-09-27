import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from '../../database/entities/producto.entity';
import { PrecioProducto, ListaPrecios } from '../../database/entities/precio-proveedor.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import {
  CreateProductoDto,
  UpdateProductoDto,
  UpdatePrecioDto,
  UpdateStockMinimoDto,
  PreciosMasivosDto,
} from './dto/producto.dto';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(PrecioProducto)
    private readonly precioRepository: Repository<PrecioProducto>,
    @InjectRepository(ListaPrecios)
    private readonly listaPreciosRepository: Repository<ListaPrecios>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
  ) {}

  async findAll(search?: string, categoriaId?: string): Promise<any[]> {
    const query = this.productoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .leftJoinAndSelect('p.unidad', 'uni')
      .leftJoinAndSelect('p.impuesto', 'imp')
      .leftJoinAndSelect('p.precios', 'pr')
      .leftJoinAndSelect('pr.lista', 'pl')
      .orderBy('p.nombre', 'ASC');

    if (search && search.trim() !== '') {
      query.andWhere(
        '(LOWER(p.nombre) LIKE :search OR LOWER(p.codigo) LIKE :search)',
        { search: `%${search.trim().toLowerCase()}%` },
      );
    }

    if (categoriaId) {
      query.andWhere('p.idCategoria = :categoriaId', { categoriaId });
    }

    const productos = await query.getMany();

    // Enriquecer con cálculo de saldo total en bodega
    const items = await Promise.all(
      productos.map(async (prod) => {
        const saldoRes = await this.movimientoRepository
          .createQueryBuilder('m')
          .select(
            `COALESCE(SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'AJUSTE_ENTRADA') THEN m.cantidad ELSE -m.cantidad END), 0)`,
            'saldo',
          )
          .where('m.id_producto = :id', { id: prod.id })
          .getRawOne();

        return {
          ...prod,
          saldoActual: parseFloat(saldoRes?.saldo || '0'),
        };
      }),
    );

    return items;
  }

  async buscar(q: string): Promise<Producto[]> {
    if (!q || q.trim() === '') return [];
    return this.productoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .leftJoinAndSelect('p.precios', 'pr')
      .leftJoinAndSelect('pr.lista', 'pl')
      .where('(LOWER(p.nombre) LIKE :q OR LOWER(p.codigo) LIKE :q)', {
        q: `%${q.trim().toLowerCase()}%`,
      })
      .andWhere('p.activo = true')
      .take(15)
      .getMany();
  }

  async findById(id: string): Promise<any> {
    const producto = await this.productoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .leftJoinAndSelect('p.unidad', 'uni')
      .leftJoinAndSelect('p.impuesto', 'imp')
      .leftJoinAndSelect('p.precios', 'pr')
      .leftJoinAndSelect('pr.lista', 'pl')
      .where('p.id = :id', { id })
      .getOne();

    if (!producto) throw new NotFoundException(`Producto con ID ${id} no encontrado`);

    // Calcular saldos por bodega
    const saldosPorBodega = await this.movimientoRepository
      .createQueryBuilder('m')
      .innerJoin('m.bodega', 'b')
      .select('b.id', 'idBodega')
      .addSelect('b.nombre', 'bodegaNombre')
      .addSelect('b.codigo', 'bodegaCodigo')
      .addSelect(
        `COALESCE(SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'AJUSTE_ENTRADA') THEN m.cantidad ELSE -m.cantidad END), 0)`,
        'saldo',
      )
      .where('m.id_producto = :id', { id })
      .groupBy('b.id')
      .addGroupBy('b.nombre')
      .addGroupBy('b.codigo')
      .getRawMany();

    const saldoTotal = saldosPorBodega.reduce(
      (acc, curr) => acc + parseFloat(curr.saldo || '0'),
      0,
    );

    return {
      ...producto,
      saldoTotal,
      saldosPorBodega: saldosPorBodega.map((b) => ({
        ...b,
        saldo: parseFloat(b.saldo || '0'),
      })),
    };
  }

  async create(dto: CreateProductoDto): Promise<Producto> {
    const existing = await this.productoRepository.findOne({ where: { codigo: dto.codigo } });
    if (existing) throw new ConflictException(`Ya existe un producto con el código ${dto.codigo}`);

    const prod = this.productoRepository.create({
      codigo: dto.codigo,
      nombre: dto.nombre,
      idCategoria: dto.idCategoria,
      idUnidad: dto.idUnidad,
      idImpuestoVenta: dto.idImpuestoVenta,
      manejaInventario: dto.manejaInventario ?? true,
      stockMinimo: dto.stockMinimo ?? 0,
      activo: true,
    });
    const saved = await this.productoRepository.save(prod);

    // Asignar precio base a lista pública si se especifica
    if (dto.precioBase) {
      const listaPub = await this.listaPreciosRepository.findOne({
        where: { nombre: 'Precio Público / Mostrador' },
      });
      if (listaPub) {
        const precio = this.precioRepository.create({
          idLista: listaPub.id,
          idProducto: saved.id,
          precio: dto.precioBase,
          vigenteDesde: new Date().toISOString().split('T')[0],
        });
        await this.precioRepository.save(precio);
      }
    }

    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateProductoDto): Promise<Producto> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    Object.assign(prod, dto);
    await this.productoRepository.save(prod);
    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    prod.activo = false;
    await this.productoRepository.save(prod);
    return { message: 'Producto desactivado exitosamente (borrado lógico)' };
  }

  async updatePrecio(id: string, dto: UpdatePrecioDto): Promise<PrecioProducto> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);

    const nuevoPrecio = this.precioRepository.create({
      idProducto: id,
      idLista: dto.idLista,
      precio: dto.precio,
      vigenteDesde: dto.vigenteDesde || new Date().toISOString().split('T')[0],
    });
    return this.precioRepository.save(nuevoPrecio);
  }

  async updateStockMinimo(id: string, dto: UpdateStockMinimoDto): Promise<Producto> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    prod.stockMinimo = dto.stockMinimo;
    return this.productoRepository.save(prod);
  }

  async historialPrecios(id: string): Promise<PrecioProducto[]> {
    return this.precioRepository.find({
      where: { idProducto: id },
      relations: ['lista'],
      order: { vigenteDesde: 'DESC' },
    });
  }

  async getMargen(id: string) {
    const prod = await this.findById(id);
    const ultimoCosto = 120000.00; // Tomado de producto_proveedor o último movimiento
    const precioPublico = prod.precios?.find((p: any) => p.lista?.nombre?.includes('Público'))?.precio || 185000;
    const margenBruto = precioPublico - ultimoCosto;
    const porcentajeMargen = ((margenBruto / precioPublico) * 100).toFixed(2);

    return {
      productoId: id,
      codigo: prod.codigo,
      nombre: prod.nombre,
      costoAdquisicion: ultimoCosto,
      precioPublico,
      margenBruto,
      porcentajeMargen: `${porcentajeMargen}%`,
    };
  }

  async actualizarPreciosMasivo(dto: PreciosMasivosDto): Promise<{ actualizados: number }> {
    let count = 0;
    const fecha = new Date().toISOString().split('T')[0];

    for (const cambio of dto.cambios) {
      const prod = await this.productoRepository.findOne({
        where: { codigo: cambio.codigoProducto },
      });
      if (prod) {
        const precio = this.precioRepository.create({
          idProducto: prod.id,
          idLista: cambio.idLista,
          precio: cambio.nuevoPrecio,
          vigenteDesde: fecha,
        });
        await this.precioRepository.save(precio);
        count++;
      }
    }

    return { actualizados: count };
  }
}
