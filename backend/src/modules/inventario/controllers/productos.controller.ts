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
import { ProductosService } from '../productos.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import {
  CreateProductoDto,
  UpdateProductoDto,
  UpdatePrecioDto,
  UpdateStockMinimoDto,
  PreciosMasivosDto,
} from '../dto/producto.dto';

@ApiTags('Productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Listar productos con saldos y filtros' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoriaId', required: false })
  async findAll(@Query('search') search?: string, @Query('categoriaId') categoriaId?: string) {
    return this.productosService.findAll(search, categoriaId);
  }

  @Get('buscar')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Búsqueda rápida por código o referencia' })
  @ApiQuery({ name: 'q', required: true })
  async buscar(@Query('q') q: string) {
    return this.productosService.buscar(q);
  }

  @Get(':id')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Consultar detalle del producto con saldos por bodega' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productosService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Crear nuevo producto' })
  async create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Actualizar descripción, unidad o categoría' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductoDto,
  ) {
    return this.productosService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Borrado lógico de producto (solo Administrador)' })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productosService.remove(id);
  }

  @Patch(':id/precio')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Cambiar precio del producto (solo Administrador)' })
  async updatePrecio(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePrecioDto,
  ) {
    return this.productosService.updatePrecio(id, dto);
  }

  @Patch(':id/stock-minimo')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Definir stock mínimo (solo Administrador)' })
  async updateStockMinimo(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStockMinimoDto,
  ) {
    return this.productosService.updateStockMinimo(id, dto);
  }

  @Get(':id/historial-precios')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Consultar historial de cambios de precio' })
  async historialPrecios(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productosService.historialPrecios(id);
  }

  @Get(':id/margen')
  @RequirePermission('inventario.costos')
  @ApiOperation({ summary: 'Consultar margen y costos de adquisición' })
  async getMargen(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productosService.getMargen(id);
  }

  @Post('precios/masivo')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualización masiva de precios (solo Administrador)' })
  async actualizarPreciosMasivo(@Body() dto: PreciosMasivosDto) {
    return this.productosService.actualizarPreciosMasivo(dto);
  }
}
