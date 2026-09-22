import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../../users/users.service';
import { RefreshToken } from '../../../database/entities/refresh-token.entity';
import { User } from '../../../database/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    email: 'admin@crmcontable.com',
    passwordHash: '$2a$10$wN9Q7iF6Vv4qJgL0lZ4mreM6zC6uGvR8QWq9Yg9tX8uBv2vKj8jC6',
    nombres: 'Administrador',
    apellidos: 'Principal',
    activo: true,
    rol: {
      id: 'rol-uuid-1',
      codigo: 'ADMIN',
      nombre: 'Administrador',
      descripcion: 'Acceso total',
      activo: true,
      creadoEn: new Date(),
      usuarios: [],
      permisos: [
        {
          id: 'perm-1',
          modulo: 'ventas',
          codigo: 'ventas.crear',
          nombre: 'Crear ventas',
          descripcion: 'Crear facturas',
          roles: [],
        },
      ],
    },
  };

  const mockRefreshTokenRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation(async (token) => ({ id: 'token-uuid', ...token })),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updateLastLogin: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked.jwt.token'),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(7),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('validateCredentials', () => {
    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateCredentials('inexistente@crm.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si la contraseña no coincide', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(
        service.validateCredentials('admin@crmcontable.com', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('debe autenticar exitosamente y devolver accessToken y rawRefreshToken', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      const result = await service.login({
        email: 'admin@crmcontable.com',
        password: 'correctpassword',
      });

      expect(result.response.accessToken).toBe('mocked.jwt.token');
      expect(result.response.user.email).toBe('admin@crmcontable.com');
      expect(result.response.user.rol).toBe('ADMIN');
      expect(result.response.user.permisos).toContain('ventas.crear');
      expect(result.rawRefreshToken).toBeDefined();
    });
  });
});
