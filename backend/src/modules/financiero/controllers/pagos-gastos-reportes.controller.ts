import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PagosService } from '../pagos.service';
import { GastosService, UsuarioActual } from '../gastos.service';
import { ReportesService } from '../reportes.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreatePagoDto, CreateGastoDto, UpdateGastoDto } from '../dto/pagos-gastos.dto';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';

@ApiTags('Pagos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Get()
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Listar pagos y recaudos' })
  @ApiQuery({ name: 'tipoPago', required: false, enum: ['factura de venta', 'factura de compra'] })
  async findAll(@Query('tipoPago') tipoPago?: string) {
    return this.pagosService.findAll(tipoPago);
  }

  @Get(':id')
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Detalle del pago con las facturas a las que se aplicó' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagosService.findById(id);
  }

  @Get(':id/recibo')
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Recibo de caja en PDF (pendiente: responde 501)' })
  @ApiResponse({ status: 501, description: 'Generación de PDF no implementada' })
  async getRecibo(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagosService.getRecibo(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Registrar pago o abono (afecta el saldo de la factura)' })
  @ApiResponse({ status: 409, description: 'Factura anulada, castigada o sin saldo' })
  @ApiResponse({ status: 422, description: 'El monto supera el saldo pendiente' })
  async create(@Body() dto: CreatePagoDto, @CurrentUser('id') idUsuario: string) {
    return this.pagosService.create(dto, idUsuario);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pagos.anular')
  @ApiOperation({ summary: 'Anular pago y reabrir el saldo (solo Administrador)' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto) {
    return this.pagosService.anular(id, dto.motivo);
  }
}

@ApiTags('Gastos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Get()
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Listar gastos (propios, o de todos con gastos.consultar_todos)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'categoriaId', required: false })
  @ApiQuery({ name: 'incluirAnulados', required: false, type: Boolean })
  async findAll(
    @CurrentUser() usuario: UsuarioActual,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('categoriaId') idCategoria?: string,
    @Query('incluirAnulados', new ParseBoolPipe({ optional: true })) incluirAnulados?: boolean,
  ) {
    return this.gastosService.findAll(usuario, { desde, hasta, idCategoria, incluirAnulados });
  }

  @Get(':id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Detalle de gasto' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioActual) {
    return this.gastosService.findById(id, usuario);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Registrar gasto (queda asociado al usuario autenticado)' })
  async create(@Body() dto: CreateGastoDto, @CurrentUser() usuario: UsuarioActual) {
    return this.gastosService.create(dto, usuario);
  }

  @Patch(':id')
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Editar gasto propio no anulado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGastoDto,
    @CurrentUser() usuario: UsuarioActual,
  ) {
    return this.gastosService.update(id, dto, usuario);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('compras.anular')
  @ApiOperation({ summary: 'Anular gasto (solo Administrador)' })
  async anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularDocumentoDto,
    @CurrentUser() usuario: UsuarioActual,
  ) {
    return this.gastosService.anular(id, dto.motivo, usuario);
  }
}

@ApiTags('Dashboard y Reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('dashboard/resumen')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'KPIs operativos del día (ventas, recaudos, gastos, alertas)' })
  async getDashboardResumen() {
    return this.reportesService.getDashboardResumen();
  }

  @Get('dashboard/financiero')
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'KPIs financieros del mes (ingresos, costo, margen, utilidad)' })
  @ApiQuery({ name: 'periodo', required: false, example: '2026-09' })
  async getDashboardFinanciero(@Query('periodo') periodo?: string) {
    return this.reportesService.getDashboardFinanciero(periodo);
  }

  @Get('reportes/ventas')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Reporte de ventas (sin márgenes). Por defecto, últimos 30 días' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  async getReporteVentas(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.reportesService.getReporteVentas(desde, hasta);
  }
}
