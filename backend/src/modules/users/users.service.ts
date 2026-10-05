import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { ConsultaUsuariosDto, UpdateUserDto } from './dto/update-user.dto';
import { TokensUsuarioService } from './tokens-usuario.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { Actor } from '../auth/decorators/actor.decorator';

/** Permiso que define a un administrador para la regla del último administrador. */
const PERMISO_ADMINISTRADOR = 'usuarios.gestionar';

export type ContextoActor = Pick<Actor, 'id' | 'ip' | 'userAgent'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly tokensUsuario: TokensUsuarioService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros: ConsultaUsuariosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.userRepository
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.rol', 'rol')
      .select([
        'usuario.id',
        'usuario.email',
        'usuario.nombres',
        'usuario.apellidos',
        'usuario.telefono',
        'usuario.activo',
        'usuario.ultimoLogin',
        'usuario.creadoEn',
        'usuario.actualizadoEn',
        'usuario.idRol',
        'rol.id',
        'rol.codigo',
        'rol.nombre',
      ])
      .orderBy('usuario.creadoEn', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.search?.trim()) {
      query.andWhere(
        '(LOWER(usuario.nombres) LIKE :search OR LOWER(usuario.apellidos) LIKE :search OR LOWER(usuario.email) LIKE :search)',
        { search: `%${filtros.search.trim().toLowerCase()}%` },
      );
    }
    if (filtros.idRol) query.andWhere('usuario.idRol = :idRol', { idRol: filtros.idRol });

    const [data, total] = await query.getManyAndCount();
    return paginado(data, total, pagina);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
      relations: ['rol', 'rol.permisos'],
      select: {
        id: true,
        email: true,
        passwordHash: true,
        nombres: true,
        apellidos: true,
        activo: true,
        idRol: true,
        idTercero: true,
      },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['rol', 'rol.permisos'],
      select: {
        id: true,
        email: true,
        nombres: true,
        apellidos: true,
        telefono: true,
        activo: true,
        ultimoLogin: true,
        creadoEn: true,
        actualizadoEn: true,
        idRol: true,
        idTercero: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  /**
   * Crea el usuario. Sin contraseña, se le envía una invitación por correo
   * para que la defina él mismo (catálogo §19: "Crear usuario e invitar por correo").
   */
  async create(dto: CreateUserDto, actor?: ContextoActor) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException(`El correo electrónico ${dto.email} ya está registrado`);
    }

    const role = await this.roleRepository.findOne({ where: { id: dto.idRol } });
    if (!role) {
      throw new BadRequestException(`El rol asignado no existe`);
    }

    const invitar = !dto.password;
    // Una cuenta invitada tiene una contraseña aleatoria que nadie conoce hasta que acepta la invitación
    const passwordHash = await bcrypt.hash(dto.password || randomBytes(32).toString('hex'), 10);

    const { id, token } = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        User,
        manager.create(User, {
          email,
          passwordHash,
          nombres: dto.nombres.trim(),
          apellidos: dto.apellidos.trim(),
          telefono: dto.telefono?.trim(),
          idRol: dto.idRol,
          activo: dto.activo ?? true,
        }),
      );
      const tokenInvitacion = invitar ? await this.tokensUsuario.emitir(saved.id, 'INVITACION', manager) : null;
      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'CREAR',
          recurso: 'usuarios',
          idRecurso: saved.id,
          valorNuevo: { email, nombres: dto.nombres, apellidos: dto.apellidos, rol: role.codigo, invitado: invitar },
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return { id: saved.id, token: tokenInvitacion };
    });

    if (token) this.tokensUsuario.enviarEnSegundoPlano(email, dto.nombres.trim(), token, 'INVITACION');
    return { ...(await this.findById(id)), invitacionEnviada: invitar };
  }

  async update(id: string, dto: UpdateUserDto, actor?: ContextoActor): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      await this.bloquearAdministradores(manager);
      const user = await manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
      }

      if (actor?.id === id) {
        if (dto.activo === false) {
          throw new BadRequestException('No puede desactivar su propio usuario');
        }
        if (dto.idRol && dto.idRol !== user.idRol) {
          throw new BadRequestException('No puede cambiar su propio rol');
        }
      }

      const anterior = { email: user.email, nombres: user.nombres, apellidos: user.apellidos, telefono: user.telefono, rol: user.rol?.codigo, activo: user.activo };

      if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
        const emailExists = await manager.findOne(User, { where: { email: dto.email.toLowerCase().trim() } });
        if (emailExists) {
          throw new ConflictException(`El correo electrónico ${dto.email} ya está en uso`);
        }
        user.email = dto.email.toLowerCase().trim();
      }

      let nuevoRol: Role | null = null;
      if (dto.idRol && dto.idRol !== user.idRol) {
        nuevoRol = await manager.findOne(Role, { where: { id: dto.idRol }, relations: ['permisos'] });
        if (!nuevoRol) {
          throw new BadRequestException(`El rol asignado no existe`);
        }
      }

      // Regla: no puede quedar el sistema sin administradores activos
      const pierdeAdministracion =
        dto.activo === false || (nuevoRol && !nuevoRol.permisos?.some((p) => p.codigo === PERMISO_ADMINISTRADOR));
      if (pierdeAdministracion) await this.validarNoEsUltimoAdministrador(manager, id);

      if (nuevoRol) {
        user.idRol = nuevoRol.id;
        // Evita que la relación cargada (eager) pise el nuevo id_rol al guardar
        user.rol = nuevoRol;
      }

      const cambiaPassword = !!dto.password;
      if (cambiaPassword) {
        user.passwordHash = await bcrypt.hash(dto.password!, 10);
      }

      if (dto.nombres !== undefined) user.nombres = dto.nombres.trim();
      if (dto.apellidos !== undefined) user.apellidos = dto.apellidos.trim();
      if (dto.telefono !== undefined) user.telefono = dto.telefono?.trim();
      if (dto.activo !== undefined) user.activo = dto.activo;

      await manager.save(User, user);
      if (cambiaPassword || dto.activo === false || nuevoRol) {
        // Un cambio de rol o de clave obliga a iniciar sesión de nuevo con los permisos vigentes
        await manager.update(RefreshToken, { idUsuario: id, revocado: false }, { revocado: true });
      }

      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: nuevoRol ? 'CAMBIAR_ROL' : 'ACTUALIZAR',
          recurso: 'usuarios',
          idRecurso: id,
          valorAnterior: anterior,
          valorNuevo: {
            email: user.email,
            nombres: user.nombres,
            apellidos: user.apellidos,
            telefono: user.telefono,
            rol: nuevoRol?.codigo ?? anterior.rol,
            activo: user.activo,
            passwordCambiada: cambiaPassword,
          },
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return user;
    }).then((u) => this.findById(u.id));
  }

  /** Desactivar no borra el usuario ni su historial de auditoría (catálogo §19). */
  async setActivo(id: string, activo: boolean, actor?: ContextoActor): Promise<{ message: string }> {
    if (!activo && actor?.id === id) {
      throw new BadRequestException('No puede desactivar su propio usuario');
    }
    return this.dataSource.transaction(async (manager) => {
      await this.bloquearAdministradores(manager);
      const user = await manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
      if (user.activo === activo) {
        throw new ConflictException(`El usuario ya está ${activo ? 'activo' : 'inactivo'}`);
      }
      if (!activo) await this.validarNoEsUltimoAdministrador(manager, id);

      await manager.update(User, id, { activo });
      if (!activo) await manager.update(RefreshToken, { idUsuario: id, revocado: false }, { revocado: true });
      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: activo ? 'ACTIVAR' : 'DESACTIVAR',
          recurso: 'usuarios',
          idRecurso: id,
          valorAnterior: { activo: !activo },
          valorNuevo: { activo },
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return { message: `Usuario ${user.email} ${activo ? 'activado' : 'desactivado'} correctamente` };
    });
  }

  async resetPassword(id: string, password: string): Promise<{ message: string }> {
    const user = await this.findById(id);
    await this.userRepository.update(id, { passwordHash: await bcrypt.hash(password, 10) });
    const revocadas = await this.revocarTokens(id);
    return {
      message: `Contraseña de ${user.email} actualizada. Sesiones cerradas: ${revocadas}`,
    };
  }

  async cerrarSesiones(id: string): Promise<{ message: string; sesionesCerradas: number }> {
    const user = await this.findById(id);
    const revocadas = await this.revocarTokens(id);
    return { message: `Sesiones de ${user.email} cerradas`, sesionesCerradas: revocadas };
  }

  async findSesiones(id: string) {
    await this.findById(id);
    const tokens = await this.refreshTokenRepository
      .createQueryBuilder('t')
      .where('t.idUsuario = :id', { id })
      .andWhere('t.revocado = false')
      .andWhere('t.expiraEn > now()')
      .orderBy('t.creadoEn', 'DESC')
      .getMany();

    return tokens.map((t) => ({
      id: t.id,
      creadoEn: t.creadoEn,
      expiraEn: t.expiraEn,
      ipAddress: t.ipAddress,
      userAgent: t.userAgent,
    }));
  }

  private async revocarTokens(idUsuario: string): Promise<number> {
    const res = await this.refreshTokenRepository.update(
      { idUsuario, revocado: false },
      { revocado: true },
    );
    return res.affected || 0;
  }

  /** Serializa los cambios que pueden dejar al sistema sin administradores. */
  private async bloquearAdministradores(manager: EntityManager) {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('crm_ultimo_administrador'))`);
  }

  private async validarNoEsUltimoAdministrador(manager: EntityManager, idUsuario: string) {
    const [fila] = await manager.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM usuarios u
             JOIN roles r ON r.id_rol = u.id_rol AND r.activo
             JOIN roles_permisos rp ON rp.id_rol = r.id_rol
             JOIN permisos p ON p.id_permiso = rp.id_permiso AND p.codigo = $2
            WHERE u.id_usuario = $1 AND u.activo) AS es_admin,
         (SELECT COUNT(DISTINCT u.id_usuario) FROM usuarios u
             JOIN roles r ON r.id_rol = u.id_rol AND r.activo
             JOIN roles_permisos rp ON rp.id_rol = r.id_rol
             JOIN permisos p ON p.id_permiso = rp.id_permiso AND p.codigo = $2
            WHERE u.activo AND u.id_usuario <> $1)::int AS otros`,
      [idUsuario, PERMISO_ADMINISTRADOR],
    );
    if (fila.es_admin && fila.otros === 0) {
      throw new UnprocessableEntityException({
        message: 'No se puede desactivar ni quitar el rol al último administrador activo del sistema',
        tipo: 'ultimo-administrador',
      });
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, {
      ultimoLogin: new Date(),
    });
  }

  async findUserWithPassword(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['rol'],
      select: {
        id: true,
        email: true,
        passwordHash: true,
        nombres: true,
        apellidos: true,
        telefono: true,
        activo: true,
        idRol: true,
      },
    });
  }

  async saveUser(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  async findUserActivity(id: string, p: { page?: number; limit?: number } = {}) {
    const user = await this.findById(id);
    const actividad = await this.auditoria.findByUsuario(id, p);
    return {
      usuario: { id: user.id, email: user.email, nombres: `${user.nombres} ${user.apellidos}` },
      ...actividad,
    };
  }
}
