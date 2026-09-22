import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, {
      ultimoLogin: new Date(),
    });
  }
}
