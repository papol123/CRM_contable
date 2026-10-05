import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
import { costoPromedio, sqlCantidadConSigno } from '../../common/inventario/stock';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { redondear } from '../../common/documentos/totales';

const LISTA_PUBLICA = 'Precio Público / Mostrador';

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
            `COALESCE(SUM(${sqlCantidadConSigno('m')}), 0)`,
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
        `COALESCE(SUM(${sqlCantidadConSigno('m')}), 0)`,
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
      idMarca: dto.idMarca,
      activo: true,
    });
    const saved = await this.productoRepository.save(prod);

    // Asignar precio base a lista pública si se especifica
    if (dto.precioBase) {
      const listaPub = await this.listaPreciosRepository.findOne({
        where: { nombre: LISTA_PUBLICA },
      });
      if (listaPub) {
        const precio = this.precioRepository.create({
          idLista: listaPub.id,
          idProducto: saved.id,
          precio: dto.precioBase,
          vigenteDesde: fechaHoy(),
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
    return this.registrarPrecio(id, dto.idLista, dto.precio, dto.vigenteDesde || fechaHoy());
  }

  /** Registra un precio nuevo y cierra la vigencia del precio abierto de la misma lista. */
  private async registrarPrecio(
    idProducto: string,
    idLista: string,
    precio: number,
    vigenteDesde: string,
  ): Promise<PrecioProducto> {
    const lista = await this.listaPreciosRepository.findOne({ where: { id: idLista } });
    if (!lista) throw new BadRequestException(`La lista de precios ${idLista} no existe`);

    await this.precioRepository.update(
      { idProducto, idLista, vigenteHasta: IsNull() },
      { vigenteHasta: sumarDias(vigenteDesde, -1) },
    );

    return this.precioRepository.save(
      this.precioRepository.create({ idProducto, idLista, precio, vigenteDesde }),
    );
  }

  async updateStockMinimo(id: string, dto: UpdateStockMinimoDto): Promise<Producto> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    prod.stockMinimo = dto.stockMinimo;
    return this.productoRepository.save(prod);
  }

  async historialPrecios(id: string): Promise<PrecioProducto[]> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    return this.precioRepository.find({
      where: { idProducto: id },
      relations: ['lista'],
      order: { vigenteDesde: 'DESC' },
    });
  }

  async getMargen(id: string) {
    const prod = await this.findById(id);
    const costoAdquisicion = await costoPromedio(this.productoRepository.manager, id);

    const hoy = fechaHoy();
    const precioVigente = (prod.precios || [])
      .filter(
        (p: PrecioProducto) =>
          p.lista?.nombre === LISTA_PUBLICA &&
          p.vigenteDesde <= hoy &&
          (!p.vigenteHasta || p.vigenteHasta >= hoy),
      )
      .sort((a: PrecioProducto, b: PrecioProducto) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0];

    if (!precioVigente) {
      throw new NotFoundException(`El producto ${prod.codigo} no tiene precio público vigente`);
    }

    const precioPublico = Number(precioVigente.precio);
    const margenBruto = redondear(precioPublico - costoAdquisicion);

    return {
      productoId: id,
      codigo: prod.codigo,
      nombre: prod.nombre,
      costoAdquisicion,
      metodoCosto: 'Costo promedio ponderado',
      precioPublico,
      margenBruto,
      porcentajeMargen: `${((margenBruto / precioPublico) * 100).toFixed(2)}%`,
    };
  }

  async actualizarPreciosMasivo(
    dto: PreciosMasivosDto,
  ): Promise<{ actualizados: number; noEncontrados: string[] }> {
    const fecha = fechaHoy();
    const noEncontrados: string[] = [];
    let actualizados = 0;

    for (const cambio of dto.cambios) {
      const prod = await this.productoRepository.findOne({
        where: { codigo: cambio.codigoProducto },
      });
      if (!prod) {
        noEncontrados.push(cambio.codigoProducto);
        continue;
      }
      await this.registrarPrecio(prod.id, cambio.idLista, cambio.nuevoPrecio, fecha);
      actualizados++;
    }

    return { actualizados, noEncontrados };
  }
}
