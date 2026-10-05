import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../../users/users.service';
import { TokensUsuarioService } from '../../users/tokens-usuario.service';
import { User } from '../../../database/entities/user.entity';
import { RefreshToken } from '../../../database/entities/refresh-token.entity';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { LoginDto } from '../dto/login.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { UpdateProfileDto } from '../dto/profile.dto';

export interface ContextoCliente {
  ip?: string;
  userAgent?: string;
}

/** Mismo mensaje para correo inexistente, inactivo o contraseña errada: no revela cuentas. */
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';
const COSTO_BCRYPT = 10;
// Hash de una contraseña aleatoria: iguala el tiempo de respuesta cuando el correo no existe
const HASH_SEÑUELO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), COSTO_BCRYPT);

/** Convierte '15m', '8h', '7d' o segundos a segundos. */
export function duracionEnSegundos(valor: string | number | undefined, porDefecto = 900): number {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  if (typeof valor === 'number' || /^\d+$/.test(String(valor))) return Number(valor);
  const m = /^(\d+)\s*([smhd])$/i.exec(String(valor).trim());
  if (!m) return porDefecto;
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase() as 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * factor;
}

@Injectable()
export class AuthService {
  private readonly expiraEnSegundos: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokensUsuario: TokensUsuarioService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditoria: AuditoriaService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {
    this.expiraEnSegundos = duracionEnSegundos(configService.get('JWT_EXPIRATION') || '15m');
  }

  async validateCredentials(email: string, pass: string, cliente: ContextoCliente = {}): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    const coincide = await bcrypt.compare(pass, user?.passwordHash || HASH_SEÑUELO);

    if (!user || !coincide || !user.activo) {
      await this.auditoria.registrar({
        idUsuario: user?.id ?? null,
        accion: 'LOGIN_FALLIDO',
        recurso: 'auth',
        valorNuevo: { email: email.toLowerCase().trim() },
        motivo: !user ? 'Correo no registrado' : !coincide ? 'Contraseña incorrecta' : 'Usuario inactivo',
        ip: cliente.ip,
        userAgent: cliente.userAgent,
        resultado: 'FALLO',
      });
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    return user;
  }

  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ response: AuthResponseDto; rawRefreshToken: string }> {
    const user = await this.validateCredentials(loginDto.email, loginDto.password, { ip: ipAddress, userAgent });
    await this.usersService.updateLastLogin(user.id);

    const rawRefreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);
    await this.auditoria.registrar({
      idUsuario: user.id,
      accion: 'LOGIN',
      recurso: 'auth',
      idRecurso: user.id,
      ip: ipAddress,
      userAgent,
    });
    return { response: this.respuestaSesion(user), rawRefreshToken };
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
      where: { tokenHash },
      relations: ['usuario', 'usuario.rol', 'usuario.rol.permisos'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido o revocado');
    }

    if (storedToken.revocado) {
      // Reuso de un token ya rotado: posible robo. Se cierran todas las sesiones del usuario.
      await this.refreshTokenRepository.update({ idUsuario: storedToken.idUsuario, revocado: false }, { revocado: true });
      await this.auditoria.registrar({
        idUsuario: storedToken.idUsuario,
        accion: 'REUSO_REFRESH_TOKEN',
        recurso: 'auth',
        motivo: 'Se presentó un refresh token ya rotado; se revocaron todas las sesiones',
        ip: ipAddress,
        userAgent,
        resultado: 'FALLO',
      });
      throw new UnauthorizedException('Refresh token inválido o revocado');
    }

    if (new Date() > storedToken.expiraEn) {
      storedToken.revocado = true;
      await this.refreshTokenRepository.save(storedToken);
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Rotación: el token usado queda revocado
    storedToken.revocado = true;
    await this.refreshTokenRepository.save(storedToken);

    const user = storedToken.usuario;
    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const newRefreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);
    return { response: this.respuestaSesion(user), newRefreshToken };
  }

  async logout(rawRefreshToken: string, cliente: ContextoCliente = {}): Promise<void> {
    if (!rawRefreshToken) return;

    const token = await this.refreshTokenRepository.findOne({ where: { tokenHash: this.hashToken(rawRefreshToken) } });
    if (!token) return;
    await this.refreshTokenRepository.update({ id: token.id }, { revocado: true });
    await this.auditoria.registrar({
      idUsuario: token.idUsuario,
      accion: 'LOGOUT',
      recurso: 'auth',
      ip: cliente.ip,
      userAgent: cliente.userAgent,
    });
  }

  /** El usuario solo cambia sus datos de contacto; rol, correo y estado los gestiona un administrador. */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersService.findById(userId);
    const anterior = { nombres: user.nombres, apellidos: user.apellidos, telefono: user.telefono };

    if (dto.nombres !== undefined) user.nombres = dto.nombres.trim();
    if (dto.apellidos !== undefined) user.apellidos = dto.apellidos.trim();
    if (dto.telefono !== undefined) user.telefono = dto.telefono?.trim();

    await this.usersService.saveUser(user);
    await this.auditoria.registrar({
      idUsuario: userId,
      accion: 'ACTUALIZAR_PERFIL',
      recurso: 'usuarios',
      idRecurso: userId,
      valorAnterior: anterior,
      valorNuevo: { nombres: user.nombres, apellidos: user.apellidos, telefono: user.telefono },
    });
    return this.perfil(user);
  }

  async changePassword(
    userId: string,
    currentPass: string,
    newPass: string,
    cliente: ContextoCliente = {},
  ): Promise<{ message: string }> {
    const userWithPass = await this.usersService.findUserWithPassword(userId);
    if (!userWithPass) throw new UnauthorizedException('Usuario no encontrado');

    const isMatch = await bcrypt.compare(currentPass, userWithPass.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    if (currentPass === newPass) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }

    userWithPass.passwordHash = await bcrypt.hash(newPass, COSTO_BCRYPT);
    await this.usersService.saveUser(userWithPass);
    await this.refreshTokenRepository.update({ idUsuario: userId }, { revocado: true });
    await this.auditoria.registrar({
      idUsuario: userId,
      accion: 'CAMBIO_PASSWORD',
      recurso: 'auth',
      idRecurso: userId,
      ip: cliente.ip,
      userAgent: cliente.userAgent,
    });

    return { message: 'Contraseña cambiada exitosamente. Inicie sesión de nuevo en sus otros dispositivos' };
  }

  /**
   * Siempre responde lo mismo, exista o no el correo (catálogo §4.1).
   * Si la cuenta existe y está activa se envía un enlace de un solo uso válido por 1 hora.
   */
  async forgotPassword(email: string, cliente: ContextoCliente = {}): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (user && user.activo) {
      const token = await this.tokensUsuario.emitir(user.id, 'RESET_PASSWORD');
      this.tokensUsuario.enviarEnSegundoPlano(user.email, user.nombres, token, 'RESET_PASSWORD');
      await this.auditoria.registrar({
        idUsuario: user.id,
        accion: 'SOLICITUD_RESET_PASSWORD',
        recurso: 'auth',
        idRecurso: user.id,
        ip: cliente.ip,
        userAgent: cliente.userAgent,
      });
    }
    return {
      message: 'Si el correo electrónico está registrado, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  /** Fija la contraseña con un token de recuperación o de invitación; el token queda consumido. */
  async resetPassword(token: string, newPass: string, cliente: ContextoCliente = {}): Promise<{ message: string }> {
    const resultado = await this.dataSource.transaction(async (manager) => {
      const consumido = await this.tokensUsuario.consumir(token, manager);
      if (!consumido) return null;

      const [usuario] = await manager.query(`SELECT activo FROM usuarios WHERE id_usuario = $1`, [consumido.idUsuario]);
      if (!usuario?.activo) return null;

      await manager.query(
        `UPDATE usuarios SET password_hash = $2, actualizado_en = now() WHERE id_usuario = $1`,
        [consumido.idUsuario, await bcrypt.hash(newPass, COSTO_BCRYPT)],
      );
      await manager.query(
        `UPDATE refresh_tokens SET revocado = true WHERE id_usuario = $1 AND revocado = false`,
        [consumido.idUsuario],
      );
      await this.auditoria.registrar(
        {
          idUsuario: consumido.idUsuario,
          accion: consumido.tipo === 'INVITACION' ? 'ACTIVAR_CUENTA' : 'RESET_PASSWORD',
          recurso: 'auth',
          idRecurso: consumido.idUsuario,
          ip: cliente.ip,
          userAgent: cliente.userAgent,
        },
        manager,
      );
      return consumido;
    });

    if (!resultado) {
      throw new BadRequestException('El enlace de recuperación no es válido, ya se usó o expiró. Solicite uno nuevo');
    }
    return { message: 'Tu contraseña ha sido establecida. Ya puedes iniciar sesión.' };
  }

  private perfil(user: User) {
    const permisos = user.rol?.activo ? user.rol.permisos?.map((p) => p.codigo) || [] : [];
    return {
      id: user.id,
      email: user.email,
      nombres: user.nombres,
      apellidos: user.apellidos,
      rol: user.rol?.codigo || 'USUARIO',
      permisos,
    };
  }

  private respuestaSesion(user: User): AuthResponseDto {
    const perfil = this.perfil(user);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      rol: perfil.rol,
      permisos: perfil.permisos,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.expiraEnSegundos,
      user: perfil,
    };
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
