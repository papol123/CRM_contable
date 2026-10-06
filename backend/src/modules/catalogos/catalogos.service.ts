import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pais } from '../../database/entities/pais.entity';
import { Departamento } from '../../database/entities/departamento.entity';
import { Ciudad } from '../../database/entities/ciudad.entity';
import { TipoDocumento } from '../../database/entities/tipo-documento.entity';
import { CategoriaProducto } from '../../database/entities/categoria-producto.entity';
import { UnidadMedida } from '../../database/entities/unidad-medida.entity';
import { Impuesto } from '../../database/entities/impuesto.entity';
import { MetodoPago } from '../../database/entities/metodo-pago.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import { CategoriaGasto } from '../../database/entities/categoria-gasto.entity';
import { Marca } from '../../database/entities/marca.entity';
import { Producto } from '../../database/entities/producto.entity';
import { CreateMarcaDto, UpdateMarcaDto } from './dto/marca.dto';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/categoria.dto';
import { CreateBodegaDto, UpdateBodegaDto } from './dto/bodega.dto';
import { ESTADOS_PEDIDO_CON_RESERVA, SQL_CANTIDAD_CON_SIGNO } from '../../common/inventario/stock';
import {
  CreateImpuestoDto,
  UpdateImpuestoDto,
  CreateCategoriaGastoDto,
  UpdateCategoriaGastoDto,
} from './dto/impuesto-gasto.dto';

@Injectable()
export class CatalogosService {
  constructor(
    @InjectRepository(Pais)
    private readonly paisRepository: Repository<Pais>,
    @InjectRepository(Departamento)
    private readonly deptoRepository: Repository<Departamento>,
    @InjectRepository(Ciudad)
    private readonly ciudadRepository: Repository<Ciudad>,
    @InjectRepository(TipoDocumento)
    private readonly tipoDocRepository: Repository<TipoDocumento>,
    @InjectRepository(CategoriaProducto)
    private readonly categoriaRepository: Repository<CategoriaProducto>,
    @InjectRepository(UnidadMedida)
    private readonly unidadRepository: Repository<UnidadMedida>,
    @InjectRepository(Impuesto)
    private readonly impuestoRepository: Repository<Impuesto>,
    @InjectRepository(MetodoPago)
    private readonly metodoPagoRepository: Repository<MetodoPago>,
    @InjectRepository(Bodega)
    private readonly bodegaRepository: Repository<Bodega>,
    @InjectRepository(CategoriaGasto)
    private readonly categoriaGastoRepository: Repository<CategoriaGasto>,
    @InjectRepository(Marca)
    private readonly marcaRepository: Repository<Marca>,
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
  ) {}

  // ─── Geografía ─────────────────────────────────────────────────────────────

  async findAllPaises(): Promise<Pais[]> {
    return this.paisRepository.find({ order: { nombre: 'ASC' } });
  }

  async findDepartamentos(paisId?: string): Promise<Departamento[]> {
    const where = paisId ? { idPais: paisId } : {};
    return this.deptoRepository.find({
      where,
      order: { nombre: 'ASC' },
      relations: ['pais'],
    });
  }

  async findCiudades(departamentoId?: string, search?: string): Promise<Ciudad[]> {
    const query = this.ciudadRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.departamento', 'd')
      .leftJoinAndSelect('d.pais', 'p')
      .orderBy('c.nombre', 'ASC');

    if (departamentoId) {
      query.andWhere('c.idDepartamento = :departamentoId', { departamentoId });
    }

    if (search && search.trim() !== '') {
      query.andWhere('LOWER(c.nombre) LIKE :search', {
        search: `%${search.trim().toLowerCase()}%`,
      });
    }

    return query.getMany();
  }

  // ─── Tipos de Documento ────────────────────────────────────────────────────

  async findTiposDocumento(): Promise<TipoDocumento[]> {
    return this.tipoDocRepository.find({ order: { codigo: 'ASC' } });
  }

  // ─── Categorías de Producto ────────────────────────────────────────────────

  async findCategorias(): Promise<CategoriaProducto[]> {
    return this.categoriaRepository.find({
      relations: ['categoriaPadre', 'subcategorias'],
      order: { nombre: 'ASC' },
    });
  }

  async createCategoria(dto: CreateCategoriaDto): Promise<CategoriaProducto> {
    const cat = this.categoriaRepository.create(dto);
    return this.categoriaRepository.save(cat);
  }

  async updateCategoria(id: string, dto: UpdateCategoriaDto): Promise<CategoriaProducto> {
    const cat = await this.categoriaRepository.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    Object.assign(cat, dto);
    return this.categoriaRepository.save(cat);
  }

  async deleteCategoria(id: string): Promise<{ message: string }> {
    const cat = await this.categoriaRepository.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    const productos = await this.productoRepository.count({ where: { idCategoria: id } });
    const subcategorias = await this.categoriaRepository.count({ where: { idCategoriaPadre: id } });
    if (productos > 0 || subcategorias > 0) {
      throw new ConflictException(
        `La categoría tiene ${productos} producto(s) y ${subcategorias} subcategoría(s) asociadas`,
      );
    }
    await this.categoriaRepository.remove(cat);
    return { message: 'Categoría eliminada exitosamente' };
  }

  // ─── Unidades de Medida ────────────────────────────────────────────────────

  async findUnidadesMedida(): Promise<UnidadMedida[]> {
    return this.unidadRepository.find({ order: { codigo: 'ASC' } });
  }

  // ─── Impuestos ─────────────────────────────────────────────────────────────

  async findImpuestos(): Promise<Impuesto[]> {
    return this.impuestoRepository.find({ order: { codigo: 'ASC' } });
  }

  async createImpuesto(dto: CreateImpuestoDto): Promise<Impuesto> {
    const imp = this.impuestoRepository.create(dto);
    return this.impuestoRepository.save(imp);
  }

  async updateImpuesto(id: string, dto: UpdateImpuestoDto): Promise<Impuesto> {
    const imp = await this.impuestoRepository.findOne({ where: { id } });
    if (!imp) throw new NotFoundException(`Impuesto con ID ${id} no encontrado`);
    Object.assign(imp, dto);
    return this.impuestoRepository.save(imp);
  }

  // ─── Métodos y Formas de Pago ──────────────────────────────────────────────

  async findMetodosPago(): Promise<MetodoPago[]> {
    return this.metodoPagoRepository.find({ order: { codigo: 'ASC' } });
  }

  async findFormasPago(): Promise<Array<{ id: string; codigo: string; nombre: string; diasPlazo: number }>> {
    return [
      { id: '1', codigo: 'CONTADO', nombre: 'Contado / Inmediato', diasPlazo: 0 },
      { id: '2', codigo: 'CREDITO_15', nombre: 'Crédito a 15 días', diasPlazo: 15 },
      { id: '3', codigo: 'CREDITO_30', nombre: 'Crédito a 30 días', diasPlazo: 30 },
      { id: '4', codigo: 'CREDITO_45', nombre: 'Crédito a 45 días', diasPlazo: 45 },
      { id: '5', codigo: 'CREDITO_60', nombre: 'Crédito a 60 días', diasPlazo: 60 },
    ];
  }

  // ─── Bodegas ───────────────────────────────────────────────────────────────

  async findBodegas(): Promise<Bodega[]> {
    return this.bodegaRepository.find({
      order: { nombre: 'ASC' },
      relations: ['ciudad'],
    });
  }

  async createBodega(dto: CreateBodegaDto): Promise<Bodega> {
    const existing = await this.bodegaRepository.findOne({ where: { codigo: dto.codigo } });
    if (existing) throw new ConflictException(`Ya existe una bodega con el código ${dto.codigo}`);
    const bodega = this.bodegaRepository.create(dto);
    return this.bodegaRepository.save(bodega);
  }

  async updateBodega(id: string, dto: UpdateBodegaDto): Promise<Bodega> {
    const bodega = await this.bodegaRepository.findOne({ where: { id } });
    if (!bodega) throw new NotFoundException(`Bodega con ID ${id} no encontrada`);
    if (dto.codigo && dto.codigo !== bodega.codigo) {
      const existing = await this.bodegaRepository.findOne({ where: { codigo: dto.codigo } });
      if (existing) throw new ConflictException(`Ya existe una bodega con el código ${dto.codigo}`);
    }
    Object.assign(bodega, dto);
    return this.bodegaRepository.save(bodega);
  }

  /**
   * Una bodega con existencias, pedidos que reservan stock o conteos abiertos
   * no se elimina (catálogo §22). Sin movimientos se borra; con historial se desactiva.
   */
  async deleteBodega(id: string): Promise<{ message: string }> {
    const bodega = await this.bodegaRepository.findOne({ where: { id } });
    if (!bodega) throw new NotFoundException(`Bodega con ID ${id} no encontrada`);

    const [uso] = await this.bodegaRepository.manager.query(
      `SELECT
         (SELECT COALESCE(SUM(${SQL_CANTIDAD_CON_SIGNO}), 0) FROM movimientos_inventario m WHERE m.id_bodega = $1) AS existencias,
         (SELECT COUNT(*) FROM movimientos_inventario WHERE id_bodega = $1)::int AS movimientos,
         (SELECT COUNT(*) FROM pedidos WHERE id_bodega = $1 AND estado = ANY($2))::int AS pedidos,
         (SELECT COUNT(*) FROM conteos_inventario WHERE id_bodega = $1 AND estado = 'ABIERTO')::int AS conteos`,
      [id, ESTADOS_PEDIDO_CON_RESERVA],
    );
    if (Number(uso.existencias) !== 0) {
      throw new ConflictException(
        `La bodega ${bodega.codigo} tiene ${Number(uso.existencias)} unidades en existencia. Trasládelas antes de eliminarla`,
      );
    }
    if (uso.pedidos > 0) throw new ConflictException(`La bodega tiene ${uso.pedidos} pedido(s) abiertos`);
    if (uso.conteos > 0) throw new ConflictException('La bodega tiene un conteo de inventario abierto');

    const activas = await this.bodegaRepository.count({ where: { activo: true } });
    if (bodega.activo && activas <= 1) {
      throw new ConflictException('Debe quedar al menos una bodega activa');
    }

    if (uso.movimientos === 0) {
      await this.bodegaRepository.remove(bodega);
      return { message: `Bodega ${bodega.codigo} eliminada` };
    }
    bodega.activo = false;
    await this.bodegaRepository.save(bodega);
    return { message: `Bodega ${bodega.codigo} desactivada (conserva su historial de movimientos)` };
  }

  // ─── Categorías de Gasto ───────────────────────────────────────────────────

  async findCategoriasGasto(): Promise<CategoriaGasto[]> {
    return this.categoriaGastoRepository.find({ order: { nombre: 'ASC' } });
  }

  async createCategoriaGasto(dto: CreateCategoriaGastoDto): Promise<CategoriaGasto> {
    const existing = await this.categoriaGastoRepository.findOne({ where: { nombre: dto.nombre } });
    if (existing) throw new ConflictException(`Ya existe una categoría de gasto con el nombre ${dto.nombre}`);
    const cat = this.categoriaGastoRepository.create(dto);
    return this.categoriaGastoRepository.save(cat);
  }

  async updateCategoriaGasto(id: string, dto: UpdateCategoriaGastoDto): Promise<CategoriaGasto> {
    const cat = await this.categoriaGastoRepository.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Categoría de gasto con ID ${id} no encontrada`);
    Object.assign(cat, dto);
    return this.categoriaGastoRepository.save(cat);
  }

  // ─── Marcas ────────────────────────────────────────────────────────────────

  async findMarcas(): Promise<Marca[]> {
    return this.marcaRepository.find({ order: { nombre: 'ASC' } });
  }

  async createMarca(dto: CreateMarcaDto): Promise<Marca> {
    const nombre = dto.nombre.trim();
    const existente = await this.marcaRepository.findOne({ where: { nombre } });
    if (existente) throw new ConflictException(`Ya existe la marca ${nombre}`);
    return this.marcaRepository.save(
      this.marcaRepository.create({ nombre, paisOrigen: dto.paisOrigen, activo: true }),
    );
  }

  async updateMarca(id: string, dto: UpdateMarcaDto): Promise<Marca> {
    const marca = await this.marcaRepository.findOne({ where: { id } });
    if (!marca) throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    if (dto.nombre && dto.nombre.trim() !== marca.nombre) {
      const existente = await this.marcaRepository.findOne({ where: { nombre: dto.nombre.trim() } });
      if (existente) throw new ConflictException(`Ya existe la marca ${dto.nombre.trim()}`);
      marca.nombre = dto.nombre.trim();
    }
    if (dto.paisOrigen !== undefined) marca.paisOrigen = dto.paisOrigen;
    if (dto.activo !== undefined) marca.activo = dto.activo;
    return this.marcaRepository.save(marca);
  }

  /** Si hay productos con la marca solo se desactiva; si no, se elimina. */
  async deleteMarca(id: string): Promise<{ message: string }> {
    const marca = await this.marcaRepository.findOne({ where: { id } });
    if (!marca) throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    const productos = await this.productoRepository.count({ where: { idMarca: id } });
    if (productos > 0) {
      await this.marcaRepository.update(id, { activo: false });
      return { message: `Marca ${marca.nombre} desactivada (tiene ${productos} producto(s) asociados)` };
    }
    await this.marcaRepository.remove(marca);
    return { message: `Marca ${marca.nombre} eliminada` };
  }
}
