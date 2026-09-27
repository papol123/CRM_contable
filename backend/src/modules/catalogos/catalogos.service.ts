import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
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
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/categoria.dto';
import { CreateBodegaDto, UpdateBodegaDto } from './dto/bodega.dto';
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

  async deleteBodega(id: string): Promise<{ message: string }> {
    const bodega = await this.bodegaRepository.findOne({ where: { id } });
    if (!bodega) throw new NotFoundException(`Bodega con ID ${id} no encontrada`);
    bodega.activo = false;
    await this.bodegaRepository.save(bodega);
    return { message: 'Bodega desactivada exitosamente' };
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
}
