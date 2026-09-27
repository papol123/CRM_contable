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
import { FacturasVentaService } from '../facturas-venta.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateFacturaVentaDto,
  CalcularFacturaDto,
  UpdateFacturaVentaDto,
  AnularDocumentoDto,
} from '../dto/factura-venta.dto';

@ApiTags('Facturas de Venta')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturas-venta')
export class FacturasVentaController {
  constructor(private readonly facturasService: FacturasVentaService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar facturas de venta con filtros (incluye saldo)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'clienteId', required: false })
  @ApiQuery({ name: 'anulada', required: false, type: Boolean })
  async findAll(
    @Query('search') search?: string,
    @Query('clienteId') clienteId?: string,
    @Query('anulada', new ParseBoolPipe({ optional: true })) anulada?: boolean,
  ) {
    return this.facturasService.findAllFacturas(search, clienteId, anulada);
  }

  @Get('siguiente-consecutivo')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Consultar próximo número de factura disponible' })
  async getSiguienteConsecutivo() {
    return this.facturasService.getSiguienteConsecutivo();
  }

  @Post('calcular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Simular totales, descuentos, IVA y retenciones sin persistir' })
  calcularTotales(@Body() dto: CalcularFacturaDto) {
    return this.facturasService.calcular(dto);
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Detalle de la factura con pagos aplicados y saldo' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.facturasService.findFacturaById(id);
  }

  @Get(':id/pdf')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'PDF de la factura (pendiente: responde 501)' })
  @ApiResponse({ status: 501, description: 'Generación de PDF no implementada' })
  async getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return this.facturasService.getFacturaPdf(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({
    summary: 'Crear factura de venta transaccional',
    description:
      'Valida stock disponible y cupo de crédito, aplica el consecutivo DIAN, descarga el kardex a costo promedio y genera la cuenta por cobrar.',
  })
  @ApiResponse({ status: 409, description: 'Stock insuficiente, cupo insuficiente o sin resolución vigente' })
  async create(@Body() dto: CreateFacturaVentaDto, @CurrentUser('id') idUsuario: string) {
    return this.facturasService.createFactura(dto, idUsuario);
  }

  @Patch(':id')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Modificar campos no financieros (vencimiento, observaciones)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacturaVentaDto) {
    return this.facturasService.updateFactura(id, dto);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.anular')
  @ApiOperation({ summary: 'Anular factura y devolver el stock a su bodega (solo Administrador)' })
  @ApiResponse({ status: 409, description: 'Ya anulada, castigada o con pagos aplicados' })
  async anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularDocumentoDto,
    @CurrentUser('id') idUsuario: string,
  ) {
    return this.facturasService.anularFactura(id, dto.motivo, idUsuario);
  }
}
