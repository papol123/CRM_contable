import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { ConsultaUsuariosDto, UpdateUserDto } from '../dto/update-user.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Auditar } from '../../auditoria/auditar';
import { Actor } from '../../auth/decorators/actor.decorator';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

@ApiTags('Usuarios')
@ApiBearerAuth()
@RequirePermission('usuarios.gestionar')
@Controller('usuarios')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (paginado, filtra por texto y rol)' })
  @ApiResponse({ status: 403, description: 'Requiere usuarios.gestionar' })
  async findAll(@Query() filtros: ConsultaUsuariosDto) {
    return this.usersService.findAll(filtros);
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
  @ApiOperation({
    summary: 'Crear usuario',
    description: 'Sin contraseña, se envía al correo una invitación de un solo uso (72 h) para que el usuario la defina.',
  })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 409, description: 'El correo electrónico ya existe' })
  async create(@Body() dto: CreateUserDto, @Actor() actor: Actor) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos o cambiar el rol de un usuario' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 409, description: 'El correo electrónico ya está en uso' })
  @ApiResponse({ status: 422, description: 'Dejaría al sistema sin administradores activos' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Actor() actor: Actor) {
    return this.usersService.update(id, dto, actor);
  }

  @Post(':id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar usuario' })
  async activar(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.usersService.setActivo(id, true, actor);
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar usuario sin borrarlo (revoca sus sesiones y conserva su historial)' })
  @ApiResponse({ status: 400, description: 'No puede desactivarse a sí mismo' })
  @ApiResponse({ status: 422, description: 'Es el último administrador activo' })
  async desactivar(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.usersService.setActivo(id, false, actor);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Auditar({ accion: 'FORZAR_RESET_PASSWORD', recurso: 'usuarios' })
  @ApiOperation({ summary: 'Asignar una nueva contraseña y cerrar las sesiones abiertas' })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(id, dto.password);
  }

  @Post(':id/cerrar-sesiones')
  @HttpCode(HttpStatus.OK)
  @Auditar({ accion: 'CERRAR_SESIONES', recurso: 'usuarios' })
  @ApiOperation({ summary: 'Revocar todas las sesiones del usuario' })
  async cerrarSesiones(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.cerrarSesiones(id);
  }

  @Get(':id/actividad')
  @ApiOperation({ summary: 'Actividad reciente del usuario en la bitácora' })
  async actividad(@Param('id', ParseUUIDPipe) id: string, @Query() p: PaginacionDto) {
    return this.usersService.findUserActivity(id, p);
  }
}
