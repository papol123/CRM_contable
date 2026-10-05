import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Gasto } from '../../database/entities/pagos-gastos.entity';
import { CategoriaGasto } from '../../database/entities/categoria-gasto.entity';
import { ConsultaGastosDto, CreateGastoDto, UpdateGastoDto } from './dto/pagos-gastos.dto';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AdjuntosService, ArchivoSubido } from '../../common/archivos/adjuntos.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

/** Usuario autenticado tal como lo entrega JwtStrategy.validate */
export interface UsuarioActual {
  id: string;
  permisos: string[];
}

const PERMISO_VER_TODOS = 'gastos.consultar_todos';
const TIPOS_SOPORTE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * Gastos (gasolina, papelería, servicios...). Sin gastos.consultar_todos cada
 * usuario solo ve y edita los suyos; un gasto ajeno responde 404.
 */
@Injectable()
export class GastosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Gasto)
    private readonly gastoRepository: Repository<Gasto>,
    @InjectRepository(CategoriaGasto)
    private readonly categoriaRepository: Repository<CategoriaGasto>,
    private readonly adjuntos: AdjuntosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private puedeVerTodos(usuario: UsuarioActual): boolean {
    return usuario.permisos?.includes(PERMISO_VER_TODOS);
  }

  async findAll(usuario: UsuarioActual, filtros: ConsultaGastosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.gastoRepository
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.categoria', 'c')
      .leftJoinAndSelect('g.metodoPago', 'm')
      .orderBy('g.fecha', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (!this.puedeVerTodos(usuario)) query.andWhere('g.idUsuario = :uid', { uid: usuario.id });
    if (!filtros.incluirAnulados) query.andWhere('g.anulado = false');
    if (filtros.desde) query.andWhere('g.fecha >= :desde', { desde: filtros.desde.slice(0, 10) });
    if (filtros.hasta) query.andWhere('g.fecha < :tope', { tope: sumarDias(filtros.hasta.slice(0, 10), 1) });
    if (filtros.categoriaId) query.andWhere('g.idCategoriaGasto = :cat', { cat: filtros.categoriaId });

    const [data, total] = await query.getManyAndCount();
    return paginado(data, total, pagina);
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

  async create(dto: CreateGastoDto, actor: Actor): Promise<Gasto> {
    await this.validarCategoria(dto.idCategoriaGasto);
    const fecha = dto.fecha?.slice(0, 10) || fechaHoy();
    const id = await this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fecha, 'registrar el gasto');
      const gasto = await manager.save(
        Gasto,
        manager.create(Gasto, {
          idCategoriaGasto: dto.idCategoriaGasto,
          idMetodoPago: dto.idMetodoPago,
          descripcion: dto.descripcion.trim(),
          monto: dto.monto,
          fecha,
          idUsuario: actor.id,
          anulado: false,
        }),
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CREAR',
          recurso: 'gastos',
          idRecurso: gasto.id,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return gasto.id;
    });
    return this.findById(id, actor);
  }

  /** Solo el dueño del gasto (o quien ve todos) lo edita, mientras no esté anulado. */
  async update(id: string, dto: UpdateGastoDto, actor: Actor): Promise<Gasto> {
    const gasto = await this.findById(id, actor);
    if (gasto.anulado) throw new ConflictException('No se puede editar un gasto anulado');
    if (dto.idCategoriaGasto) await this.validarCategoria(dto.idCategoriaGasto);

    const cambios: Partial<Gasto> = {};
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion.trim();
    if (dto.monto !== undefined) cambios.monto = dto.monto;
    if (dto.idCategoriaGasto) cambios.idCategoriaGasto = dto.idCategoriaGasto;
    if (dto.idMetodoPago) cambios.idMetodoPago = dto.idMetodoPago;
    if (dto.fecha) cambios.fecha = dto.fecha.slice(0, 10);

    await this.dataSource.transaction(async (manager) => {
      // Ni la fecha original ni la nueva pueden caer en un periodo cerrado
      await validarPeriodoAbierto(manager, gasto.fecha, 'modificar el gasto');
      if (cambios.fecha) await validarPeriodoAbierto(manager, cambios.fecha, 'modificar el gasto');
      if (Object.keys(cambios).length > 0) await manager.update(Gasto, id, cambios);
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ACTUALIZAR',
          recurso: 'gastos',
          idRecurso: id,
          valorAnterior: {
            descripcion: gasto.descripcion,
            monto: Number(gasto.monto),
            idCategoriaGasto: gasto.idCategoriaGasto,
            idMetodoPago: gasto.idMetodoPago,
            fecha: gasto.fecha,
          },
          valorNuevo: cambios,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });

    return this.findById(id, actor);
  }

  async anular(id: string, motivo: string, actor: Actor) {
    const gasto = await this.findById(id, actor);
    if (gasto.anulado) throw new ConflictException('El gasto ya se encuentra anulado');
    return this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, gasto.fecha, 'anular el gasto');
      await manager.update(Gasto, id, { anulado: true, motivoAnulacion: motivo });
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ANULAR',
          recurso: 'gastos',
          idRecurso: id,
          valorAnterior: { anulado: false, monto: Number(gasto.monto), idUsuario: gasto.idUsuario },
          valorNuevo: { anulado: true },
          motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { id, anulado: true, mensaje: `Gasto anulado: ${motivo}` };
    });
  }

  /** Sube el soporte (PDF o imagen) a Cloud Storage y lo asocia al gasto. */
  async adjuntarSoporte(id: string, archivo: ArchivoSubido, actor: Actor) {
    const gasto = await this.findById(id, actor);
    if (gasto.anulado) throw new ConflictException('No se puede adjuntar soporte a un gasto anulado');
    const adjunto = await this.adjuntos.guardar('gastos', id, archivo, TIPOS_SOPORTE);
    await this.gastoRepository.update(id, { soporteUrl: `/api/v1/gastos/${id}/soporte` });
    return { ...adjunto, urlDescarga: `/api/v1/gastos/${id}/soporte` };
  }

  /** Último soporte cargado al gasto. */
  async descargarSoporte(id: string, usuario: UsuarioActual) {
    await this.findById(id, usuario);
    const [ultimo] = await this.dataSource.query(
      `SELECT id_adjunto FROM adjuntos_documento WHERE tabla = 'gastos' AND id_registro = $1
        ORDER BY subido_en DESC LIMIT 1`,
      [id],
    );
    if (!ultimo) throw new NotFoundException('El gasto no tiene soporte');
    return this.adjuntos.leer('gastos', id, ultimo.id_adjunto);
  }

  private async validarCategoria(id: string) {
    const existe = await this.categoriaRepository.count({ where: { id } });
    if (!existe) throw new BadRequestException(`La categoría de gasto ${id} no existe`);
  }
}
