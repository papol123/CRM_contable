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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProveedoresService } from '../proveedores.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { CreateProveedorDto, UpdateProveedorDto } from '../dto/proveedor-datos.dto';
import { ConsultaTercerosDto, HistorialComprasDto } from '../dto/cliente.dto';

@ApiTags('Proveedores')
@ApiBearerAuth()
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Get()
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Listar proveedores (paginado; busca por documento o razón social)' })
  async findAll(@Query() filtros: ConsultaTercerosDto) {
    return this.proveedoresService.findAll(filtros);
  }

  @Get('comparar-precios')
  @RequirePermission('inventario.costos')
  @ApiOperation({ summary: 'Comparar costo del producto entre proveedores (costos: solo Administrador, GEMINI §5.2)' })
  @ApiQuery({ name: 'productoId', required: true })
  async compararPrecios(@Query('productoId', ParseUUIDPipe) productoId: string) {
    return this.proveedoresService.compararPrecios(productoId);
  }

  @Get(':id')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Consultar detalle del proveedor' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.proveedoresService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('terceros.crear')
  @ApiOperation({ summary: 'Crear proveedor' })
  @ApiResponse({ status: 409, description: 'Ya existe un tercero con ese documento' })
  async create(@Body() dto: CreateProveedorDto, @Actor() actor: Actor) {
    return this.proveedoresService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProveedorDto,
    @Actor() actor: Actor,
  ) {
    return this.proveedoresService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('terceros.eliminar')
  @ApiOperation({ summary: 'Borrado lógico (bloqueado si hay cuentas por pagar)' })
  @ApiResponse({ status: 409, description: 'Tiene cuentas por pagar o ya está inactivo' })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Actor() actor: Actor) {
    return this.proveedoresService.remove(id, actor);
  }

  @Get(':id/historial-compras')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Consultar compras realizadas al proveedor' })
  async findHistorialCompras(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() filtros: HistorialComprasDto,
  ) {
    return this.proveedoresService.findHistorialCompras(id, filtros);
  }

  @Get(':id/productos')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Consultar productos que suministra el proveedor (el costo solo se incluye con inventario.costos)' })
  async findProductos(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Actor() actor: Actor) {
    return this.proveedoresService.findProductos(id, actor.permisos.includes('inventario.costos'));
  }
}
