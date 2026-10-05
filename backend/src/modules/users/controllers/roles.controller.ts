import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from '../roles.service';
import { CreateRoleDto, UpdateRoleDto, ReplaceRolePermisosDto } from '../dto/role.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';

@ApiTags('Roles y permisos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  // Lectura también con usuarios.gestionar: el formulario de usuarios necesita la lista de roles
  @RequirePermission('usuarios.gestionar')
  @ApiOperation({ summary: 'Listar roles con sus permisos' })
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get('permisos')
  @RequirePermission('usuarios.gestionar')
  @ApiOperation({ summary: 'Catálogo de permisos' })
  async findPermisos() {
    return this.rolesService.findAllPermisos();
  }

  @Get('roles/:id')
  @RequirePermission('usuarios.gestionar')
  @ApiOperation({ summary: 'Detalle del rol' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findById(id);
  }

  @Get('roles/:id/permisos')
  @RequirePermission('usuarios.gestionar')
  @ApiOperation({ summary: 'Permisos del rol' })
  async findPermisosDelRol(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findPermisosDelRol(id);
  }

  @Get('roles/:id/usuarios')
  @RequirePermission('usuarios.gestionar')
  @ApiOperation({ summary: 'Usuarios asignados al rol' })
  async findUsuariosDelRol(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findUsuariosDelRol(id);
  }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('roles.gestionar')
  @ApiOperation({ summary: 'Crear rol' })
  @ApiResponse({ status: 409, description: 'Código de rol duplicado' })
  async create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch('roles/:id')
  @RequirePermission('roles.gestionar')
  @ApiOperation({ summary: 'Actualizar rol' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Put('roles/:id/permisos')
  @RequirePermission('roles.gestionar')
  @ApiOperation({ summary: 'Reemplazar los permisos del rol' })
  async replacePermisos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceRolePermisosDto) {
    return this.rolesService.replacePermisos(id, dto.permisos);
  }

  @Delete('roles/:id')
  @RequirePermission('roles.gestionar')
  @ApiOperation({ summary: 'Eliminar rol sin usuarios asignados' })
  @ApiResponse({ status: 409, description: 'El rol tiene usuarios asignados' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id);
  }
}
