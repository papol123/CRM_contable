import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from '../users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('usuarios.gestionar')
@Controller('usuarios')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios con filtros opcionales' })
  @ApiQuery({ name: 'search', required: false, description: 'Término de búsqueda por nombre o correo' })
  @ApiQuery({ name: 'idRol', required: false, description: 'Filtrar por UUID de rol' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  @ApiResponse({ status: 403, description: 'Permiso denegado: requiere usuarios.gestionar' })
  async findAll(@Query('search') search?: string, @Query('idRol') idRol?: string) {
    return this.usersService.findAll(search, idRol);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del usuario con su rol y permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Get(':id/sesiones')
  @ApiOperation({ summary: 'Sesiones activas (refresh tokens vigentes) del usuario' })
  async sesiones(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findSesiones(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear usuario' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o rol inexistente' })
  @ApiResponse({ status: 409, description: 'El correo electrónico ya existe' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos o cambiar el rol de un usuario' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 409, description: 'El correo electrónico ya está en uso' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.update(id, dto, actorId);
  }

  @Post(':id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar usuario' })
  async activar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setActivo(id, true);
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar usuario sin borrarlo (revoca sus sesiones)' })
  @ApiResponse({ status: 400, description: 'No puede desactivarse a sí mismo' })
  async desactivar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.usersService.setActivo(id, false, actorId);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asignar una nueva contraseña y cerrar las sesiones abiertas' })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(id, dto.password);
  }

  @Post(':id/cerrar-sesiones')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar todas las sesiones del usuario' })
  async cerrarSesiones(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.cerrarSesiones(id);
  }
}
