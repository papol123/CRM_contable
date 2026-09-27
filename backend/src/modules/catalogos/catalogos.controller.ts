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
import { CatalogosService } from './catalogos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/categoria.dto';
import { CreateBodegaDto, UpdateBodegaDto } from './dto/bodega.dto';
import {
  CreateImpuestoDto,
  UpdateImpuestoDto,
  CreateCategoriaGastoDto,
  UpdateCategoriaGastoDto,
} from './dto/impuesto-gasto.dto';
import { CreateMarcaDto, UpdateMarcaDto } from './dto/marca.dto';

@ApiTags('Catálogos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  // ─── Geografía ─────────────────────────────────────────────────────────────

  @Get('paises')
  @ApiOperation({ summary: 'Listar todos los países' })
  @ApiResponse({ status: 200, description: 'Lista de países' })
  async getPaises() {
    return this.catalogosService.findAllPaises();
  }

  @Get('departamentos')
  @ApiOperation({ summary: 'Listar departamentos (filtrables por país)' })
  @ApiQuery({ name: 'paisId', required: false, description: 'UUID del país' })
  async getDepartamentos(@Query('paisId') paisId?: string) {
    return this.catalogosService.findDepartamentos(paisId);
  }

  @Get('ciudades')
  @ApiOperation({ summary: 'Listar ciudades (filtrables por departamento y búsqueda)' })
  @ApiQuery({ name: 'departamentoId', required: false, description: 'UUID del departamento' })
  @ApiQuery({ name: 'search', required: false, description: 'Búsqueda por nombre de ciudad' })
  async getCiudades(
    @Query('departamentoId') departamentoId?: string,
    @Query('search') search?: string,
  ) {
    return this.catalogosService.findCiudades(departamentoId, search);
  }

  @Get('tipos-documento')
  @ApiOperation({ summary: 'Listar tipos de documento (NIT, CC, CE, etc.)' })
  async getTiposDocumento() {
    return this.catalogosService.findTiposDocumento();
  }

  // ─── Categorías de Producto ────────────────────────────────────────────────

  @Get('categorias')
  @ApiOperation({ summary: 'Listar categorías de producto' })
  async getCategorias() {
    return this.catalogosService.findCategorias();
  }

  @Post('categorias')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Crear nueva categoría de producto' })
  async createCategoria(@Body() dto: CreateCategoriaDto) {
    return this.catalogosService.createCategoria(dto);
  }

  @Patch('categorias/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar categoría de producto' })
  async updateCategoria(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoriaDto,
  ) {
    return this.catalogosService.updateCategoria(id, dto);
  }

  @Delete('categorias/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Eliminar categoría de producto' })
  async deleteCategoria(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.catalogosService.deleteCategoria(id);
  }

  // ─── Unidades de Medida ────────────────────────────────────────────────────

  @Get('unidades-medida')
  @ApiOperation({ summary: 'Listar unidades de medida' })
  async getUnidadesMedida() {
    return this.catalogosService.findUnidadesMedida();
  }

  // ─── Impuestos ─────────────────────────────────────────────────────────────

  @Get('impuestos')
  @ApiOperation({ summary: 'Listar tarifas de impuesto' })
  async getImpuestos() {
    return this.catalogosService.findImpuestos();
  }

  @Post('impuestos')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Crear nueva tarifa de impuesto' })
  async createImpuesto(@Body() dto: CreateImpuestoDto) {
    return this.catalogosService.createImpuesto(dto);
  }

  @Patch('impuestos/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar tarifa de impuesto' })
  async updateImpuesto(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateImpuestoDto,
  ) {
    return this.catalogosService.updateImpuesto(id, dto);
  }

  // ─── Métodos y Formas de Pago ──────────────────────────────────────────────

  @Get('medios-pago')
  @ApiOperation({ summary: 'Listar medios de pago (efectivo, transferencia, tarjeta)' })
  async getMediosPago() {
    return this.catalogosService.findMetodosPago();
  }

  @Get('formas-pago')
  @ApiOperation({ summary: 'Listar formas de pago (contado, crédito 15/30/60 días)' })
  async getFormasPago() {
    return this.catalogosService.findFormasPago();
  }

  // ─── Bodegas ───────────────────────────────────────────────────────────────

  @Get('bodegas')
  @ApiOperation({ summary: 'Listar bodegas' })
  async getBodegas() {
    return this.catalogosService.findBodegas();
  }

  @Post('bodegas')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Crear nueva bodega' })
  async createBodega(@Body() dto: CreateBodegaDto) {
    return this.catalogosService.createBodega(dto);
  }

  @Patch('bodegas/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar bodega' })
  async updateBodega(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateBodegaDto,
  ) {
    return this.catalogosService.updateBodega(id, dto);
  }

  @Delete('bodegas/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Desactivar bodega' })
  async deleteBodega(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.catalogosService.deleteBodega(id);
  }

  // ─── Categorías de Gasto ───────────────────────────────────────────────────

  @Get('categorias-gasto')
  @ApiOperation({ summary: 'Listar categorías de gasto' })
  async getCategoriasGasto() {
    return this.catalogosService.findCategoriasGasto();
  }

  @Post('categorias-gasto')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Crear nueva categoría de gasto' })
  async createCategoriaGasto(@Body() dto: CreateCategoriaGastoDto) {
    return this.catalogosService.createCategoriaGasto(dto);
  }

  @Patch('categorias-gasto/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar categoría de gasto' })
  async updateCategoriaGasto(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoriaGastoDto,
  ) {
    return this.catalogosService.updateCategoriaGasto(id, dto);
  }

  // ─── Marcas ────────────────────────────────────────────────────────────────

  @Get('marcas')
  @ApiOperation({ summary: 'Listar marcas de repuestos y fabricantes' })
  async getMarcas() {
    return this.catalogosService.findMarcas();
  }

  @Post('marcas')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear marca (solo Administrador)' })
  async createMarca(@Body() dto: CreateMarcaDto) {
    return this.catalogosService.createMarca(dto);
  }

  @Patch('marcas/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar marca (solo Administrador)' })
  async updateMarca(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMarcaDto) {
    return this.catalogosService.updateMarca(id, dto);
  }

  @Delete('marcas/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Eliminar marca (se desactiva si tiene productos)' })
  async deleteMarca(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogosService.deleteMarca(id);
  }
}
