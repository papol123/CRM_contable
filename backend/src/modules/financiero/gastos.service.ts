import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gasto } from '../../database/entities/pagos-gastos.entity';
import { CategoriaGasto } from '../../database/entities/categoria-gasto.entity';
import { CreateGastoDto, UpdateGastoDto } from './dto/pagos-gastos.dto';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';

/** Usuario autenticado tal como lo entrega JwtStrategy.validate */
export interface UsuarioActual {
  id: string;
  permisos: string[];
}

export interface FiltrosGastos {
  desde?: string;
  hasta?: string;
  idCategoria?: string;
  incluirAnulados?: boolean;
}

const PERMISO_VER_TODOS = 'gastos.consultar_todos';

@Injectable()
export class GastosService {
  constructor(
    @InjectRepository(Gasto)
    private readonly gastoRepository: Repository<Gasto>,
    @InjectRepository(CategoriaGasto)
    private readonly categoriaRepository: Repository<CategoriaGasto>,
  ) {}

  private puedeVerTodos(usuario: UsuarioActual): boolean {
    return usuario.permisos?.includes(PERMISO_VER_TODOS);
  }

  /** M3: sin gastos.consultar_todos, cada usuario solo ve sus propios gastos. */
  async findAll(usuario: UsuarioActual, filtros: FiltrosGastos = {}): Promise<Gasto[]> {
    const query = this.gastoRepository
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.categoria', 'c')
      .leftJoinAndSelect('g.metodoPago', 'm')
      .orderBy('g.fecha', 'DESC');

    if (!this.puedeVerTodos(usuario)) query.andWhere('g.idUsuario = :uid', { uid: usuario.id });
    if (!filtros.incluirAnulados) query.andWhere('g.anulado = false');
    if (filtros.desde) query.andWhere('g.fecha >= :desde', { desde: filtros.desde });
    if (filtros.hasta) query.andWhere('g.fecha < :tope', { tope: sumarDias(filtros.hasta.slice(0, 10), 1) });
    if (filtros.idCategoria) query.andWhere('g.idCategoriaGasto = :cat', { cat: filtros.idCategoria });

    return query.getMany();
  }

  async findById(id: string, usuario: UsuarioActual): Promise<Gasto> {
    const gasto = await this.gastoRepository.findOne({
      where: { id },
      relations: ['categoria', 'metodoPago'],
    });
    // Un gasto ajeno responde 404 para no revelar que existe
    if (!gasto || (!this.puedeVerTodos(usuario) && gasto.idUsuario !== usuario.id)) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado`);
    }
    return gasto;
  }

  async create(dto: CreateGastoDto, usuario: UsuarioActual): Promise<Gasto> {
    await this.validarCategoria(dto.idCategoriaGasto);
    const gasto = await this.gastoRepository.save(
      this.gastoRepository.create({
        idCategoriaGasto: dto.idCategoriaGasto,
        idMetodoPago: dto.idMetodoPago,
        descripcion: dto.descripcion.trim(),
        monto: dto.monto,
        fecha: dto.fecha?.slice(0, 10) || fechaHoy(),
        soporteUrl: dto.soporteUrl,
        idUsuario: usuario.id,
        anulado: false,
      }),
    );
    return this.findById(gasto.id, usuario);
  }

  async update(id: string, dto: UpdateGastoDto, usuario: UsuarioActual): Promise<Gasto> {
    const gasto = await this.findById(id, usuario);
    if (gasto.anulado) throw new ConflictException('No se puede editar un gasto anulado');
    if (dto.idCategoriaGasto) await this.validarCategoria(dto.idCategoriaGasto);

    const cambios: Partial<Gasto> = {};
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion.trim();
    if (dto.monto !== undefined) cambios.monto = dto.monto;
    if (dto.idCategoriaGasto) cambios.idCategoriaGasto = dto.idCategoriaGasto;
    if (dto.idMetodoPago) cambios.idMetodoPago = dto.idMetodoPago;
    if (dto.fecha) cambios.fecha = dto.fecha.slice(0, 10);
    if (dto.soporteUrl !== undefined) cambios.soporteUrl = dto.soporteUrl;
    if (Object.keys(cambios).length > 0) await this.gastoRepository.update(id, cambios);

    return this.findById(id, usuario);
  }

  async anular(id: string, motivo: string, usuario: UsuarioActual) {
    const gasto = await this.findById(id, usuario);
    if (gasto.anulado) throw new ConflictException('El gasto ya se encuentra anulado');
    await this.gastoRepository.update(id, { anulado: true, motivoAnulacion: motivo });
    return { id, anulado: true, mensaje: `Gasto anulado: ${motivo}` };
  }

  private async validarCategoria(id: string) {
    const existe = await this.categoriaRepository.count({ where: { id } });
    if (!existe) throw new BadRequestException(`La categoría de gasto ${id} no existe`);
  }
}
