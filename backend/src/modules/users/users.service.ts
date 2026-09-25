import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findAll(search?: string, idRol?: string): Promise<User[]> {
    const query = this.userRepository
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.rol', 'rol')
      .leftJoinAndSelect('rol.permisos', 'permisos')
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
        'rol.descripcion',
        'permisos.id',
        'permisos.codigo',
        'permisos.nombre',
      ])
      .orderBy('usuario.creadoEn', 'DESC');

    if (search && search.trim() !== '') {
      query.andWhere(
        '(LOWER(usuario.nombres) LIKE :search OR LOWER(usuario.apellidos) LIKE :search OR LOWER(usuario.email) LIKE :search)',
        { search: `%${search.trim().toLowerCase()}%` },
      );
    }

    if (idRol) {
      query.andWhere('usuario.idRol = :idRol', { idRol });
    }

    return query.getMany();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
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

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException(`El correo electrónico ${dto.email} ya está registrado`);
    }

    const role = await this.roleRepository.findOne({ where: { id: dto.idRol } });
    if (!role) {
      throw new BadRequestException(`El rol asignado no existe`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser = this.userRepository.create({
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      nombres: dto.nombres.trim(),
      apellidos: dto.apellidos.trim(),
      telefono: dto.telefono?.trim(),
      idRol: dto.idRol,
      activo: dto.activo ?? true,
    });

    const saved = await this.userRepository.save(newUser);
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
      const emailExists = await this.userRepository.findOne({
        where: { email: dto.email.toLowerCase().trim() },
      });
      if (emailExists) {
        throw new ConflictException(`El correo electrónico ${dto.email} ya está en uso`);
      }
      user.email = dto.email.toLowerCase().trim();
    }

    if (dto.idRol) {
      const role = await this.roleRepository.findOne({ where: { id: dto.idRol } });
      if (!role) {
        throw new BadRequestException(`El rol asignado no existe`);
      }
      user.idRol = dto.idRol;
    }

    if (dto.password && dto.password.trim() !== '') {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.nombres !== undefined) user.nombres = dto.nombres.trim();
    if (dto.apellidos !== undefined) user.apellidos = dto.apellidos.trim();
    if (dto.telefono !== undefined) user.telefono = dto.telefono?.trim();
    if (dto.activo !== undefined) user.activo = dto.activo;

    await this.userRepository.save(user);
    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const user = await this.findById(id);
    user.activo = false;
    await this.userRepository.save(user);
    return { message: `Usuario ${user.email} desactivado correctamente` };
  }

  async findAllRoles(): Promise<Role[]> {
    return this.roleRepository.find({
      relations: ['permisos'],
      order: { nombre: 'ASC' },
    });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, {
      ultimoLogin: new Date(),
    });
  }
}
