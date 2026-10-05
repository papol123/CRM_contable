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
import { CatalogosService } from './catalogos.service';
import { Autenticado, RequirePermission } from '../auth/decorators/permissions.decorator';
import { Auditar } from '../auditoria/auditar';
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
// Lectura: cualquier usuario autenticado (alimentan formularios). Escritura: catalogos.gestionar
@Autenticado()
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

  @Get('paises/:id/departamentos')
  @ApiOperation({ summary: 'Departamentos de un país específico' })
  async getDepartamentosPorPais(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.catalogosService.findDepartamentos(id);
  }

  @Get('departamentos')
  @ApiOperation({ summary: 'Listar departamentos (filtrables por país)' })
  @ApiQuery({ name: 'paisId', required: false, description: 'UUID del país' })
  async getDepartamentos(@Query('paisId') paisId?: string) {
    return this.catalogosService.findDepartamentos(paisId);
  }

  @Get('departamentos/:id/ciudades')
  @ApiOperation({ summary: 'Ciudades de un departamento específico' })
  async getCiudadesPorDepartamento(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.catalogosService.findCiudades(id);
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
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'CREAR', recurso: 'categorias', registrarCuerpo: true })
  @ApiOperation({ summary: 'Crear nueva categoría de producto' })
  async createCategoria(@Body() dto: CreateCategoriaDto) {
    return this.catalogosService.createCategoria(dto);
  }

  @Patch('categorias/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'categorias', registrarCuerpo: true })
  @ApiOperation({ summary: 'Actualizar categoría de producto' })
  async updateCategoria(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoriaDto,
  ) {
    return this.catalogosService.updateCategoria(id, dto);
  }

  @Delete('categorias/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ELIMINAR', recurso: 'categorias', registrarCuerpo: true })
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
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'CREAR', recurso: 'impuestos', registrarCuerpo: true })
  @ApiOperation({ summary: 'Crear nueva tarifa de impuesto' })
  async createImpuesto(@Body() dto: CreateImpuestoDto) {
    return this.catalogosService.createImpuesto(dto);
  }

  @Patch('impuestos/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'impuestos', registrarCuerpo: true })
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
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'CREAR', recurso: 'bodegas', registrarCuerpo: true })
  @ApiOperation({ summary: 'Crear nueva bodega' })
  async createBodega(@Body() dto: CreateBodegaDto) {
    return this.catalogosService.createBodega(dto);
  }

  @Patch('bodegas/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'bodegas', registrarCuerpo: true })
  @ApiOperation({ summary: 'Actualizar bodega' })
  async updateBodega(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateBodegaDto,
  ) {
    return this.catalogosService.updateBodega(id, dto);
  }

  @Delete('bodegas/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ELIMINAR', recurso: 'bodegas', registrarCuerpo: true })
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
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'CREAR', recurso: 'categorias_gasto', registrarCuerpo: true })
  @ApiOperation({ summary: 'Crear nueva categoría de gasto' })
  async createCategoriaGasto(@Body() dto: CreateCategoriaGastoDto) {
    return this.catalogosService.createCategoriaGasto(dto);
  }

  @Patch('categorias-gasto/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'categorias_gasto', registrarCuerpo: true })
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
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'CREAR', recurso: 'marcas', registrarCuerpo: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear marca (solo Administrador)' })
  async createMarca(@Body() dto: CreateMarcaDto) {
    return this.catalogosService.createMarca(dto);
  }

  @Patch('marcas/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'marcas', registrarCuerpo: true })
  @ApiOperation({ summary: 'Actualizar marca (solo Administrador)' })
  async updateMarca(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMarcaDto) {
    return this.catalogosService.updateMarca(id, dto);
  }

  @Delete('marcas/:id')
  @RequirePermission('catalogos.gestionar')
  @Auditar({ accion: 'ELIMINAR', recurso: 'marcas', registrarCuerpo: true })
  @ApiOperation({ summary: 'Eliminar marca (se desactiva si tiene productos)' })
  async deleteMarca(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogosService.deleteMarca(id);
  }
}
