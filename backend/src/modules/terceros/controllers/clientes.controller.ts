import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClientesService } from '../clientes.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import {
  CreateClienteDto,
  UpdateClienteDto,
  UpdateCupoCreditoDto,
} from '../dto/cliente.dto';
import { AddTelefonoDto, AddEmailDto } from '../dto/proveedor-datos.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Listar clientes paginados con filtros' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por NIT o razón social' })
  @ApiQuery({ name: 'ciudadId', required: false, description: 'Filtrar por ciudad' })
  async findAll(@Query('search') search?: string, @Query('ciudadId') ciudadId?: string) {
    return this.clientesService.findAll(search, ciudadId);
  }

  @Get(':id')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Consultar detalle del cliente' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('terceros.crear')
  @ApiOperation({ summary: 'Crear nuevo cliente (NIT único)' })
  async create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Actualizar datos del cliente' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('terceros.eliminar')
  @ApiOperation({ summary: 'Borrado lógico de cliente (solo Administrador)' })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.remove(id);
  }

  @Get(':id/telefonos')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Listar teléfonos de un cliente' })
  async findTelefonos(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.findTelefonos(id);
  }

  @Post(':id/telefonos')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Agregar teléfono al cliente' })
  async addTelefono(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AddTelefonoDto,
  ) {
    return this.clientesService.addTelefono(id, dto);
  }

  @Delete(':id/telefonos/:telId')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Eliminar teléfono del cliente' })
  async removeTelefono(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('telId', new ParseUUIDPipe({ version: '4' })) telId: string,
  ) {
    return this.clientesService.removeTelefono(id, telId);
  }

  @Get(':id/correos')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Listar correos de un cliente' })
  async findCorreos(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.findCorreos(id);
  }

  @Post(':id/correos')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Agregar correo electrónico al cliente' })
  async addCorreo(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AddEmailDto,
  ) {
    return this.clientesService.addCorreo(id, dto);
  }

  @Get(':id/historial-compras')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Consultar historial de compras del cliente' })
  async findHistorialCompras(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.findHistorialCompras(id);
  }

  @Get(':id/cartera')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Consultar estado de cuenta y cartera del cliente' })
  async findCartera(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.findCartera(id);
  }

  @Patch(':id/cupo-credito')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Definir cupo y plazo de crédito (solo Administrador)' })
  async updateCupoCredito(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCupoCreditoDto,
  ) {
    return this.clientesService.updateCupoCredito(id, dto);
  }

  @Post(':id/bloquear-credito')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Bloquear crédito del cliente' })
  async bloquearCredito(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.bloquearCredito(id);
  }

  @Post(':id/desbloquear-credito')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Desbloquear crédito del cliente' })
  async desbloquearCredito(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.clientesService.desbloquearCredito(id);
  }
}
