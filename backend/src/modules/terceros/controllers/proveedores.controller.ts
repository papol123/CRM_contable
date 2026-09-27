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
import { ProveedoresService } from '../proveedores.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CreateProveedorDto, UpdateProveedorDto } from '../dto/proveedor-datos.dto';

@ApiTags('Proveedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Get()
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Listar proveedores' })
  @ApiQuery({ name: 'search', required: false })
  async findAll(@Query('search') search?: string) {
    return this.proveedoresService.findAll(search);
  }

  @Get('comparar-precios')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Comparar precio del producto entre proveedores' })
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
  async create(@Body() dto: CreateProveedorDto) {
    return this.proveedoresService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('terceros.editar')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.proveedoresService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('terceros.eliminar')
  @ApiOperation({ summary: 'Borrado lógico de proveedor (solo Administrador)' })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.proveedoresService.remove(id);
  }

  @Get(':id/historial-compras')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Consultar compras realizadas al proveedor' })
  async findHistorialCompras(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.proveedoresService.findHistorialCompras(id);
  }

  @Get(':id/productos')
  @RequirePermission('terceros.consultar')
  @ApiOperation({ summary: 'Consultar productos que suministra el proveedor' })
  async findProductos(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.proveedoresService.findProductos(id);
  }
}
