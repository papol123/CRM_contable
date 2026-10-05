import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../database/entities/role.entity';
import { Permission } from '../../database/entities/permission.entity';
import { User } from '../../database/entities/user.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

/** Roles del sistema que no se pueden eliminar ni dejar sin permisos. */
const ROLES_PROTEGIDOS = ['ADMIN'];

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find({ relations: ['permisos'], order: { nombre: 'ASC' } });
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id }, relations: ['permisos'] });
    if (!role) throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    return role;
  }

  async findPermisosDelRol(id: string): Promise<Permission[]> {
    return (await this.findById(id)).permisos;
  }

  async findUsuariosDelRol(id: string) {
    await this.findById(id);
    return this.userRepository.find({
      where: { idRol: id },
      select: { id: true, email: true, nombres: true, apellidos: true, activo: true, ultimoLogin: true },
      order: { nombres: 'ASC' },
    });
  }

  async findAllPermisos(): Promise<Permission[]> {
    return this.permissionRepository.find({ order: { modulo: 'ASC', codigo: 'ASC' } });
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const existente = await this.roleRepository.findOne({ where: { codigo: dto.codigo } });
    if (existente) throw new ConflictException(`Ya existe un rol con el código ${dto.codigo}`);

    const role = this.roleRepository.create({
      codigo: dto.codigo,
      nombre: dto.nombre.trim(),
      descripcion: dto.descripcion,
      activo: true,
      permisos: await this.resolverPermisos(dto.permisos || []),
    });
    const guardado = await this.roleRepository.save(role);
    return this.findById(guardado.id);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findById(id);
    if (dto.activo === false && ROLES_PROTEGIDOS.includes(role.codigo)) {
      throw new BadRequestException(`El rol ${role.codigo} no se puede desactivar`);
    }
    if (dto.nombre !== undefined) role.nombre = dto.nombre.trim();
    if (dto.descripcion !== undefined) role.descripcion = dto.descripcion;
    if (dto.activo !== undefined) role.activo = dto.activo;
    await this.roleRepository.save(role);
    return this.findById(id);
  }

  async replacePermisos(id: string, permisoIds: string[]): Promise<Role> {
    const role = await this.findById(id);
    if (ROLES_PROTEGIDOS.includes(role.codigo)) {
      throw new BadRequestException(
        `Los permisos del rol ${role.codigo} no se modifican: siempre tiene todos`,
      );
    }
    role.permisos = await this.resolverPermisos(permisoIds);
    await this.roleRepository.save(role);
    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const role = await this.findById(id);
    if (ROLES_PROTEGIDOS.includes(role.codigo)) {
      throw new BadRequestException(`El rol ${role.codigo} no se puede eliminar`);
    }
    const usuarios = await this.userRepository.count({ where: { idRol: id } });
    if (usuarios > 0) {
      throw new ConflictException(
        `El rol tiene ${usuarios} usuario(s) asignado(s). Reasígnelos antes de eliminarlo`,
      );
    }
    await this.roleRepository.remove(role);
    return { message: `Rol ${role.codigo} eliminado` };
  }

  private async resolverPermisos(ids: string[]): Promise<Permission[]> {
    if (ids.length === 0) return [];
    const permisos = await this.permissionRepository.find({ where: { id: In(ids) } });
    if (permisos.length !== ids.length) {
      const encontrados = new Set(permisos.map((p) => p.id));
      throw new BadRequestException(
        `Permisos inexistentes: ${ids.filter((i) => !encontrados.has(i)).join(', ')}`,
      );
    }
    return permisos;
  }
}
