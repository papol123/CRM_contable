import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AuthService, ContextoCliente } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { AuthResponseDto, UserProfileDto } from '../dto/auth-response.dto';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordWithTokenDto,
} from '../dto/profile.dto';
import { Public } from '../decorators/public.decorator';
import { Autenticado } from '../decorators/permissions.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';

const COOKIE_REFRESH = 'refreshToken';
/** Límite estricto contra fuerza bruta: 10 intentos por minuto por IP. */
const LIMITE_SENSIBLE = { default: { limit: 10, ttl: 60_000 } };

function opcionesCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
  };
}

function contexto(req: Request): ContextoCliente {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  private readonly diasRefresh = Number(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || 7);

  constructor(private readonly authService: AuthService) {}

  private guardarCookie(res: Response, token: string) {
    res.cookie(COOKIE_REFRESH, token, { ...opcionesCookie(), maxAge: this.diasRefresh * 24 * 60 * 60 * 1000 });
  }

  @Public()
  @Throttle(LIMITE_SENSIBLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve el access token en el cuerpo y deja el refresh token en una cookie HttpOnly. Los intentos fallidos quedan en la bitácora de accesos.',
  })
  @ApiResponse({ status: 200, description: 'Login exitoso', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { response, rawRefreshToken } = await this.authService.login(loginDto, req.ip, req.headers['user-agent']);
    this.guardarCookie(res, rawRefreshToken);
    return response;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar access token',
    description: 'Usa el refresh token de la cookie HttpOnly y lo rota. Reusar un token ya rotado cierra todas las sesiones.',
  })
  @ApiResponse({ status: 200, description: 'Token renovado', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token no provisto, inválido o revocado' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    const { response, newRefreshToken } = await this.authService.refresh(
      req.cookies?.[COOKIE_REFRESH],
      req.ip,
      req.headers['user-agent'],
    );
    this.guardarCookie(res, newRefreshToken);
    return response;
  }

  /** Público: debe poder cerrar la sesión aunque el access token ya haya vencido. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión', description: 'Revoca el refresh token de la cookie y la elimina.' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(req.cookies?.[COOKIE_REFRESH], contexto(req));
    res.clearCookie(COOKIE_REFRESH, opcionesCookie());
  }

  @Autenticado()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado con su rol y permisos efectivos' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async getMe(@CurrentUser() user: UserProfileDto): Promise<UserProfileDto> {
    return user;
  }

  @Autenticado()
  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualizar datos propios',
    description: 'Nombres, apellidos y teléfono. El rol, el correo y el estado solo los cambia un administrador.',
  })
  async updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @Autenticado()
  @Throttle(LIMITE_SENSIBLE)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar contraseña propia (cierra las demás sesiones)' })
  async changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword, contexto(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description: 'Envía un enlace de un solo uso (1 hora). La respuesta es la misma exista o no el correo.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto.email, contexto(req));
  }

  @Public()
  @Throttle(LIMITE_SENSIBLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Establecer nueva contraseña con token de un solo uso',
    description: 'Sirve para el enlace de recuperación y para activar una cuenta invitada. Cierra todas las sesiones.',
  })
  @ApiResponse({ status: 400, description: 'Token inválido, usado o vencido' })
  async resetPassword(@Body() dto: ResetPasswordWithTokenDto, @Req() req: Request) {
    return this.authService.resetPassword(dto.token, dto.newPassword, contexto(req));
  }
}
