import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FinancieroService } from '../financiero.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CreatePagoDto, CreateGastoDto, UpdateGastoDto } from '../dto/pagos-gastos.dto';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';

@ApiTags('Pagos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pagos')
export class PagosController {
  constructor(private readonly financieroService: FinancieroService) {}

  @Get()
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Listar pagos y recaudos realizados' })
  async findAll() {
    return this.financieroService.findAllPagos();
  }

  @Get(':id')
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Consultar detalle de pago' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financieroService.findPagoById(id);
  }

  @Get(':id/recibo')
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Descargar recibo de caja / comprobante de pago en PDF' })
  async getRecibo(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financieroService.getPagoRecibo(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pagos.registrar')
  @ApiOperation({ summary: 'Registrar pago o abono (afecta saldo de factura y caja)' })
  async create(@Body() dto: CreatePagoDto) {
    return this.financieroService.createPago(dto);
  }

  @Post(':id/anular')
  @RequirePermission('pagos.anular')
  @ApiOperation({ summary: 'Anular pago (solo Administrador)' })
  async anular(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AnularDocumentoDto,
  ) {
    return this.financieroService.anularPago(id, dto.motivo);
  }
}

@ApiTags('Gastos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gastos')
export class GastosController {
  constructor(private readonly financieroService: FinancieroService) {}

  @Get()
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Listar gastos registrados' })
  async findAll() {
    return this.financieroService.findAllGastos();
  }

  @Get(':id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Consultar detalle de gasto' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financieroService.findGastoById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Registrar nuevo gasto' })
  async create(@Body() dto: CreateGastoDto) {
    return this.financieroService.createGasto(dto);
  }

  @Patch(':id')
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Editar gasto (mientras el periodo contable esté abierto)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateGastoDto,
  ) {
    return this.financieroService.updateGasto(id, dto);
  }

  @Post(':id/anular')
  @RequirePermission('compras.anular')
  @ApiOperation({ summary: 'Anular gasto (solo Administrador)' })
  async anular(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AnularDocumentoDto,
  ) {
    return this.financieroService.anularGasto(id, dto.motivo);
  }
}

@ApiTags('Dashboard y Reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ReportesController {
  constructor(private readonly financieroService: FinancieroService) {}

  @Get('dashboard/resumen')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'KPIs operativos del día (ventas, recaudos, gastos, alertas)' })
  async getDashboardResumen() {
    return this.financieroService.getDashboardResumen();
  }

  @Get('dashboard/financiero')
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'KPIs financieros del mes (márgenes, utilidad, flujo)' })
  async getDashboardFinanciero() {
    return this.financieroService.getDashboardFinanciero();
  }

  @Get('reportes/ventas')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Reporte consolidado de ventas' })
  async getReporteVentas() {
    return this.financieroService.getReporteVentas();
  }
}
