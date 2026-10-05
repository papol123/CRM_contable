import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { AuthResponseDto, UserProfileDto } from '../dto/auth-response.dto';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Autentica las credenciales del usuario, devuelve el JWT access token en el cuerpo y almacena el refresh token en una cookie segura HttpOnly.',
  })
  @ApiResponse({ status: 200, description: 'Login exitoso', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o usuario inactivo' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    const { response, rawRefreshToken } = await this.authService.login(
      loginDto,
      ip,
      userAgent,
    );

    // Adjuntar refresh token en Cookie segura HttpOnly
    res.cookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
      path: '/api/v1/auth',
    });

    return response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar Access Token',
    description:
      'Renueva el access token a partir del refresh token contenido en la cookie HttpOnly y rota el refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Token renovado exitosamente', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token no provisto, inválido o revocado' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const rawRefreshToken = req.cookies?.refreshToken;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    const { response, newRefreshToken } = await this.authService.refresh(
      rawRefreshToken,
      ip,
      userAgent,
    );

    // Actualizar la cookie con el nuevo Refresh Token rotado
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return response;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Invalida el refresh token en base de datos y elimina la cookie de sesión.',
  })
  @ApiResponse({ status: 204, description: 'Sesión cerrada exitosamente' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawRefreshToken = req.cookies?.refreshToken;
    await this.authService.logout(rawRefreshToken);

    // Limpiar la cookie de sesión
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener datos del usuario autenticado',
    description: 'Devuelve la identidad, rol y permisos efectivos del usuario actual.',
  })
  @ApiResponse({ status: 200, description: 'Perfil de usuario', type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  async getMe(@CurrentUser() user: any): Promise<UserProfileDto> {
    return user;
  }
}
