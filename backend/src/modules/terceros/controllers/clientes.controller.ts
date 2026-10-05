import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseArrayPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ClientesService } from '../clientes.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Auditar } from '../../auditoria/auditar';
import {
  BloqueoCreditoDto,
  ConsultaTercerosDto,
  CreateClienteDto,
  HistorialComprasDto,
  UpdateClienteDto,
  UpdateCupoCreditoDto,
} from '../dto/cliente.dto';
import { AddTelefonoDto, AddEmailDto } from '../dto/proveedor-datos.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Listar clientes (paginado; busca por documento o razón social)' })
  async findAll(@Query() filtros: ConsultaTercerosDto) {
    return this.clientesService.findAll(filtros);
  }

  @Post('importar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('terceros.importar')
  @Auditar({ accion: 'IMPORTAR', recurso: 'clientes' })
  @ApiBody({ type: [CreateClienteDto] })
  @ApiOperation({ summary: 'Importar clientes (arreglo; informa errores por fila)' })
  async importar(
    @Body(new ParseArrayPipe({ items: CreateClienteDto, whitelist: true, forbidNonWhitelisted: true }))
    clientes: CreateClienteDto[],
    @Actor() actor: Actor,
  ) {
    return this.clientesService.importar(clientes.slice(0, 5000), actor);
  }

  @Get(':id')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Detalle del cliente' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('terceros.crear')
  @ApiOperation({ summary: 'Registrar cliente (documento único; cupo y plazo requieren cartera.gestionar)' })
  @ApiResponse({ status: 409, description: 'Ya existe un tercero con ese documento' })
  async create(@Body() dto: CreateClienteDto, @Actor() actor: Actor) {
    return this.clientesService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Actualizar datos de contacto y dirección' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClienteDto, @Actor() actor: Actor) {
    return this.clientesService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('terceros.eliminar')
  @ApiOperation({ summary: 'Borrado lógico (bloqueado si tiene saldo pendiente o pedidos abiertos)' })
  @ApiResponse({ status: 409, description: 'Tiene saldo pendiente, pedidos abiertos o ya está inactivo' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.clientesService.remove(id, actor);
  }

  @Get(':id/telefonos')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Teléfonos del cliente' })
  async findTelefonos(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findTelefonos(id);
  }

  @Post(':id/telefonos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Agregar teléfono' })
  async addTelefono(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddTelefonoDto) {
    return this.clientesService.addTelefono(id, dto);
  }

  @Delete(':id/telefonos/:telId')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Eliminar teléfono' })
  async removeTelefono(@Param('id', ParseUUIDPipe) id: string, @Param('telId', ParseUUIDPipe) telId: string) {
    return this.clientesService.removeTelefono(id, telId);
  }

  @Get(':id/correos')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Correos del cliente' })
  async findCorreos(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findCorreos(id);
  }

  @Post(':id/correos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Agregar correo' })
  async addCorreo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddEmailDto) {
    return this.clientesService.addCorreo(id, dto);
  }

  @Get(':id/historial-compras')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Historial de compras del cliente (paginado, filtrable por fechas)' })
  async findHistorialCompras(@Param('id', ParseUUIDPipe) id: string, @Query() filtros: HistorialComprasDto) {
    return this.clientesService.findHistorialCompras(id, filtros);
  }

  @Get(':id/cartera')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Estado de cuenta: remisiones pendientes, abonos, saldo y días de mora' })
  async findCartera(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findCartera(id);
  }

  @Patch(':id/cupo-credito')
  @RequirePermission('cartera.gestionar')
  @ApiOperation({ summary: 'Definir cupo y plazo de crédito (auditado)' })
  async updateCupoCredito(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCupoCreditoDto, @Actor() actor: Actor) {
    return this.clientesService.updateCupoCredito(id, dto, actor);
  }

  @Post(':id/bloquear-credito')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cartera.gestionar')
  @ApiOperation({ summary: 'Bloquear ventas a crédito (conserva el cupo; motivo obligatorio)' })
  async bloquearCredito(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BloqueoCreditoDto, @Actor() actor: Actor) {
    return this.clientesService.bloquearCredito(id, dto.motivo, actor);
  }

  @Post(':id/desbloquear-credito')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cartera.gestionar')
  @ApiOperation({ summary: 'Desbloquear crédito (motivo obligatorio)' })
  async desbloquearCredito(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BloqueoCreditoDto, @Actor() actor: Actor) {
    return this.clientesService.desbloquearCredito(id, dto.motivo, actor);
  }
}
