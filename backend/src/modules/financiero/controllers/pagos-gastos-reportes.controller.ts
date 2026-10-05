import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiProduces } from '@nestjs/swagger';
import { PagosService } from '../pagos.service';
import { GastosService } from '../gastos.service';
import { ReportesService } from '../reportes.service';
import { RequirePermission, Autenticado } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Idempotente } from '../../../common/idempotencia/idempotencia';
import { archivo } from '../../../common/archivos/respuesta-archivo';
import { ArchivoSubido } from '../../../common/archivos/adjuntos.service';
import { TAMANO_MAXIMO_ADJUNTO } from '../../../common/almacenamiento/almacenamiento.service';
import {
  ConsultaGastosDto,
  ConsultaPagosDto,
  CreatePagoDto,
  CreateGastoDto,
  UpdateGastoDto,
} from '../dto/pagos-gastos.dto';
import {
  CierreMensualDto,
  DashboardConfigDto,
  ExportarReporteDto,
  PeriodoDto,
  RangoFechasDto,
  ReabrirPeriodoDto,
} from '../dto/reportes.dto';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';

@ApiTags('Pagos')
@ApiBearerAuth()
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Get()
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Listar pagos y recaudos (paginado; filtra por tipo, tercero y fechas)' })
  async findAll(@Query() filtros: ConsultaPagosDto) {
    return this.pagosService.findAll(filtros);
  }

  @Get(':id')
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Detalle del pago con los documentos a los que se aplicó' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagosService.findById(id);
  }

  @Get(':id/recibo')
  @RequirePermission('pagos.registrar')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Recibo de caja (cliente) o comprobante de egreso (proveedor) en PDF' })
  async getRecibo(@Param('id', ParseUUIDPipe) id: string) {
    const { contenido, nombre } = await this.pagosService.getRecibo(id);
    return archivo(contenido, nombre, 'application/pdf');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pagos.registrar')
  @Idempotente()
  @ApiOperation({
    summary: 'Registrar pago o abono (transaccional e idempotente)',
    description: 'Crea el pago, lo aplica al saldo del documento y lo marca PAGADA si queda en cero. Envíe Idempotency-Key.',
  })
  @ApiResponse({ status: 409, description: 'Documento anulado, castigado o sin saldo' })
  @ApiResponse({ status: 422, description: 'El monto supera el saldo pendiente o el periodo está cerrado' })
  async create(@Body() dto: CreatePagoDto, @Actor() actor: Actor) {
    return this.pagosService.create(dto, actor);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pagos.anular')
  @ApiOperation({ summary: 'Reversar pago con motivo y reabrir el saldo del documento' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto, @Actor() actor: Actor) {
    return this.pagosService.anular(id, dto.motivo, actor);
  }
}

@ApiTags('Gastos')
@ApiBearerAuth()
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Get()
  @RequirePermission('gastos.registrar')
  @ApiOperation({ summary: 'Listar gastos propios (o de todos con gastos.consultar_todos)' })
  async findAll(@Query() filtros: ConsultaGastosDto, @Actor() actor: Actor) {
    return this.gastosService.findAll(actor, filtros);
  }

  @Get(':id')
  @RequirePermission('gastos.registrar')
  @ApiOperation({ summary: 'Detalle de gasto (un gasto ajeno responde 404)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.gastosService.findById(id, actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('gastos.registrar')
  @ApiOperation({ summary: 'Registrar gasto (queda a nombre del usuario autenticado)' })
  @ApiResponse({ status: 422, description: 'Periodo contable cerrado' })
  async create(@Body() dto: CreateGastoDto, @Actor() actor: Actor) {
    return this.gastosService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('gastos.registrar')
  @ApiOperation({ summary: 'Editar gasto propio no anulado' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGastoDto, @Actor() actor: Actor) {
    return this.gastosService.update(id, dto, actor);
  }

  @Post(':id/soporte')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('gastos.registrar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ADJUNTO, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] } })
  @ApiOperation({ summary: 'Subir soporte del gasto (PDF o imagen, máx. 10 MB)' })
  @ApiResponse({ status: 415, description: 'Tipo de archivo no permitido' })
  async adjuntarSoporte(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() soporte: ArchivoSubido,
    @Actor() actor: Actor,
  ) {
    return this.gastosService.adjuntarSoporte(id, soporte, actor);
  }

  @Get(':id/soporte')
  @RequirePermission('gastos.registrar')
  @ApiOperation({ summary: 'Descargar el soporte del gasto' })
  async descargarSoporte(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    const { contenido, nombre, tipoMime } = await this.gastosService.descargarSoporte(id, actor);
    return archivo(contenido, nombre, tipoMime);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('gastos.anular')
  @ApiOperation({ summary: 'Anular gasto con motivo' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto, @Actor() actor: Actor) {
    return this.gastosService.anular(id, dto.motivo, actor);
  }
}

@ApiTags('Dashboard y Reportes')
@ApiBearerAuth()
@Controller()
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('dashboard/resumen')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'KPIs operativos del día (volumen, sin costos ni márgenes)' })
  async getDashboardResumen() {
    return this.reportesService.getDashboardResumen();
  }

  @Get('dashboard/config')
  @Autenticado()
  @ApiOperation({ summary: 'Configuración propia del dashboard' })
  async getDashboardConfig(@CurrentUser('id') usuarioId: string) {
    return this.reportesService.getDashboardConfig(usuarioId);
  }

  @Put('dashboard/config')
  @Autenticado()
  @ApiOperation({ summary: 'Guardar la configuración propia del dashboard' })
  async saveDashboardConfig(@Body() config: DashboardConfigDto, @CurrentUser('id') usuarioId: string) {
    return this.reportesService.saveDashboardConfig(config, usuarioId);
  }

  @Get('dashboard/financiero')
  @RequirePermission('reportes.financieros')
  @ApiOperation({ summary: 'KPIs financieros del mes (ingresos, costo, margen, utilidad)' })
  async getDashboardFinanciero(@Query() q: PeriodoDto) {
    return this.reportesService.getDashboardFinanciero(q.periodo);
  }

  @Get('reportes/ventas')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Ventas por periodo, cliente y producto (sin márgenes). Por defecto, últimos 30 días' })
  async getReporteVentas(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteVentas(q.desde, q.hasta);
  }

  @Get('reportes/inventario')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Existencias y rotación de inventario (sin costos)' })
  async getReporteInventario() {
    return this.reportesService.getReporteInventario();
  }

  @Get('reportes/cartera')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Cartera por edades y por cliente' })
  async getReporteCartera() {
    return this.reportesService.getReporteCartera();
  }

  @Get('reportes/utilidad')
  @RequirePermission('reportes.financieros')
  @ApiOperation({ summary: 'Utilidad bruta y operativa del rango' })
  async getReporteUtilidad(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteUtilidad(q.desde, q.hasta);
  }

  @Get('reportes/rentabilidad')
  @RequirePermission('reportes.financieros')
  @ApiOperation({ summary: 'Rentabilidad y margen por producto' })
  async getReporteRentabilidad(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteRentabilidad(q.desde, q.hasta);
  }

  @Get('reportes/flujo-caja')
  @RequirePermission('reportes.financieros')
  @ApiOperation({ summary: 'Flujo de caja: recaudos vs. pagos a proveedores y gastos' })
  async getReporteFlujoCaja(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteFlujoCaja(q.desde, q.hasta);
  }

  @Get('reportes/gastos')
  @RequirePermission('gastos.consultar_todos')
  @ApiOperation({ summary: 'Gastos de todos los usuarios con totales por categoría' })
  async getReporteGastos(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteGastos(q.desde, q.hasta);
  }

  @Get('reportes/compras')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Compras con base, IVA, retenciones y total' })
  async getReporteCompras(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteCompras(q.desde, q.hasta);
  }

  @Get('reportes/inventario-valorizado')
  @RequirePermission('inventario.costos')
  @ApiOperation({ summary: 'Inventario valorizado a costo promedio ponderado' })
  async getReporteInventarioValorizado() {
    return this.reportesService.getReporteInventarioValorizado();
  }

  @Get('reportes/ventas-por-vendedor')
  @RequirePermission('reportes.financieros')
  @ApiOperation({ summary: 'Desempeño comercial por vendedor' })
  async getReporteVentasPorVendedor(@Query() q: RangoFechasDto) {
    return this.reportesService.getReporteVentasPorVendedor(q.desde, q.hasta);
  }

  @Get('reportes/estado-resultados')
  @RequirePermission('reportes.financieros')
  @ApiOperation({ summary: 'Estado de resultados del mes (P&G)' })
  async getReporteEstadoResultados(@Query() q: PeriodoDto) {
    return this.reportesService.getReporteEstadoResultados(q.periodo);
  }

  @Post('reportes/cierre-mensual')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'Cierre contable de un mes terminado (bloquea documentos con fecha en ese mes)' })
  @ApiResponse({ status: 409, description: 'El periodo ya está cerrado' })
  @ApiResponse({ status: 422, description: 'El mes aún no termina' })
  async ejecutarCierreMensual(@Body() dto: CierreMensualDto, @Actor() actor: Actor) {
    return this.reportesService.ejecutarCierreMensual(dto, actor);
  }

  @Post('reportes/exportar')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('reportes.exportar')
  @ApiOperation({
    summary: 'Exportar un reporte a CSV (asíncrono)',
    description: 'Exige además el permiso del reporte. Consulte el avance en GET /reportes/jobs/{jobId}.',
  })
  @ApiResponse({ status: 202, description: 'Exportación encolada' })
  async exportarReporte(@Body() dto: ExportarReporteDto, @Actor() actor: Actor) {
    return this.reportesService.exportarReporte(dto, actor);
  }

  @Get('reportes/jobs/:jobId')
  @Autenticado()
  @ApiOperation({ summary: 'Estado de una tarea asíncrona propia (exportaciones, envíos) y su enlace de descarga' })
  async getJob(@Param('jobId', ParseUUIDPipe) jobId: string, @Actor() actor: Actor) {
    return this.reportesService.getJob(jobId, actor);
  }

  @Get('reportes/jobs/:jobId/descargar')
  @Autenticado()
  @ApiOperation({ summary: 'Descargar el archivo generado por una tarea propia' })
  @ApiResponse({ status: 409, description: 'La tarea no ha terminado' })
  async descargarJob(@Param('jobId', ParseUUIDPipe) jobId: string, @Actor() actor: Actor) {
    const { contenido, nombre, tipoMime } = await this.reportesService.descargarJob(jobId, actor);
    return archivo(contenido, nombre, tipoMime, 'attachment');
  }

  @Get('periodos-contables')
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'Periodos contables abiertos y cerrados' })
  async getPeriodosContables() {
    return this.reportesService.getPeriodosContables();
  }

  @Post('periodos-contables/:id/cerrar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'Cerrar de nuevo un periodo reabierto (recalcula totales)' })
  async cerrarPeriodoContable(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.reportesService.cerrarPeriodoContable(id, actor);
  }

  @Post('periodos-contables/:id/reabrir')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'Reabrir periodo contable con motivo (auditado)' })
  async reabrirPeriodoContable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReabrirPeriodoDto, @Actor() actor: Actor) {
    return this.reportesService.reabrirPeriodoContable(id, dto.motivo, actor);
  }
}
