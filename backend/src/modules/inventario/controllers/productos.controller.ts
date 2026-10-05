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
import { ProductosService } from '../productos.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Auditar } from '../../auditoria/auditar';
import {
  CreateProductoDto,
  UpdateProductoDto,
  UpdatePrecioDto,
  UpdateStockMinimoDto,
  PreciosMasivosDto,
  EquivalenciaDto,
  ConsultaProductosDto,
  BuscarProductosDto,
} from '../dto/producto.dto';

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Listar productos con saldo (paginado; filtra por texto, categoría y marca)' })
  async findAll(@Query() filtros: ConsultaProductosDto) {
    return this.productosService.findAll(filtros);
  }

  @Get('buscar')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Búsqueda rápida de productos activos por código o nombre (máx. 15)' })
  async buscar(@Query() q: BuscarProductosDto) {
    return this.productosService.buscar(q.q);
  }

  @Post('precios/masivo')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('productos.precios')
  @ApiOperation({ summary: 'Actualización masiva de precios (todo o nada, auditada)' })
  async actualizarPreciosMasivo(@Body() dto: PreciosMasivosDto, @Actor() actor: Actor) {
    return this.productosService.actualizarPreciosMasivo(dto, actor);
  }

  @Post('importar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('productos.importar')
  @Auditar({ accion: 'IMPORTAR', recurso: 'productos' })
  @ApiBody({ type: [CreateProductoDto] })
  @ApiOperation({ summary: 'Importar catálogo de productos (arreglo; informa errores por fila)' })
  async importar(
    @Body(new ParseArrayPipe({ items: CreateProductoDto, whitelist: true, forbidNonWhitelisted: true }))
    productos: CreateProductoDto[],
    @Actor() actor: Actor,
  ) {
    return this.productosService.importar(productos.slice(0, 5000), actor);
  }

  @Get(':id')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Detalle del producto: precios, impuesto y saldos por bodega' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('productos.crear')
  @ApiOperation({ summary: 'Crear producto (el precio base requiere productos.precios)' })
  @ApiResponse({ status: 409, description: 'Código duplicado' })
  async create(@Body() dto: CreateProductoDto, @Actor() actor: Actor) {
    return this.productosService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('productos.editar')
  @ApiOperation({ summary: 'Actualizar datos no financieros: nombre, marca, categoría, unidad, impuesto' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductoDto, @Actor() actor: Actor) {
    return this.productosService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('productos.eliminar')
  @ApiOperation({ summary: 'Borrado lógico (bloqueado si tiene existencias o pedidos abiertos)' })
  @ApiResponse({ status: 409, description: 'Tiene existencias, pedidos abiertos o ya está inactivo' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.productosService.remove(id, actor);
  }

  @Patch(':id/precio')
  @RequirePermission('productos.precios')
  @ApiOperation({ summary: 'Cambiar el precio de venta en una lista (cierra la vigencia del anterior; auditado)' })
  async updatePrecio(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePrecioDto, @Actor() actor: Actor) {
    return this.productosService.updatePrecio(id, dto, actor);
  }

  @Patch(':id/stock-minimo')
  @RequirePermission('inventario.ajustar')
  @Auditar({ accion: 'DEFINIR_STOCK_MINIMO', recurso: 'productos', registrarCuerpo: true })
  @ApiOperation({ summary: 'Definir stock mínimo para alertas' })
  async updateStockMinimo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockMinimoDto) {
    return this.productosService.updateStockMinimo(id, dto);
  }

  @Get(':id/historial-precios')
  @RequirePermission('productos.precios', 'inventario.costos')
  @ApiOperation({ summary: 'Historial de precios de venta y de costos de compra' })
  async historialPrecios(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.historialPrecios(id);
  }

  @Get(':id/margen')
  @RequirePermission('inventario.costos')
  @ApiOperation({ summary: 'Costo promedio, precio público y margen' })
  async getMargen(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.getMargen(id);
  }

  @Get(':id/equivalencias')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Productos equivalentes' })
  async getEquivalencias(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.getEquivalencias(id);
  }

  @Post(':id/equivalencias')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('productos.editar')
  @Auditar({ accion: 'REGISTRAR_EQUIVALENCIA', recurso: 'productos', registrarCuerpo: true })
  @ApiOperation({ summary: 'Registrar producto equivalente (en ambos sentidos)' })
  async createEquivalencia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EquivalenciaDto) {
    return this.productosService.createEquivalencia(id, dto.idEquivalente, dto.observacion);
  }
}
