import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../../users/users.service';
import { User } from '../../../database/entities/user.entity';
import { RefreshToken } from '../../../database/entities/refresh-token.entity';
import { LoginDto } from '../dto/login.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async validateCredentials(email: string, pass: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.activo) {
      throw new UnauthorizedException('El usuario se encuentra inactivo');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ response: AuthResponseDto; rawRefreshToken: string }> {
    const user = await this.validateCredentials(loginDto.email, loginDto.password);

    // Actualizar fecha de último login
    await this.usersService.updateLastLogin(user.id);

    const permisos = user.rol?.permisos?.map((p) => p.codigo) || [];

    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol?.codigo || 'USUARIO',
      permisos,
    };

    const accessToken = this.jwtService.sign(payload);
    const rawRefreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

    const response: AuthResponseDto = {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutos
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol?.codigo || 'USUARIO',
        permisos,
      },
    };

    return { response, rawRefreshToken };
  }

  async refresh(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ response: AuthResponseDto; newRefreshToken: string }> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token no provisto');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash, revocado: false },
      relations: ['usuario', 'usuario.rol', 'usuario.rol.permisos'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido o revocado');
    }

    if (new Date() > storedToken.expiraEn) {
      storedToken.revocado = true;
      await this.refreshTokenRepository.save(storedToken);
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Revocación para rotación de token (Token Rotation)
    storedToken.revocado = true;
    await this.refreshTokenRepository.save(storedToken);

    const user = storedToken.usuario;
    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const permisos = user.rol?.permisos?.map((p) => p.codigo) || [];
    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol?.codigo || 'USUARIO',
      permisos,
    };

    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

    const response: AuthResponseDto = {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol?.codigo || 'USUARIO',
        permisos,
      },
    };

    return { response, newRefreshToken };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepository.update(
      { tokenHash },
      { revocado: true },
    );
  }

  private async createRefreshToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const expirationDays = Number(
      this.configService.get<number>('REFRESH_TOKEN_EXPIRATION_DAYS', 7),
    );
    const expiraEn = new Date();
    expiraEn.setDate(expiraEn.getDate() + expirationDays);

    const tokenEntity = this.refreshTokenRepository.create({
      idUsuario: userId,
      tokenHash,
      expiraEn,
      ipAddress,
      userAgent,
      revocado: false,
    });

    await this.refreshTokenRepository.save(tokenEntity);
    return rawToken;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
