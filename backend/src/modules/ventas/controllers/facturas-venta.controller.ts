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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VentasService } from '../ventas.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
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
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar facturas de venta con filtros' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'clienteId', required: false })
  async findAll(
    @Query('search') search?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.ventasService.findAllFacturas(search, clienteId);
  }

  @Get('siguiente-consecutivo')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Consultar próximo número de factura disponible' })
  async getSiguienteConsecutivo() {
    return this.ventasService.getSiguienteConsecutivo();
  }

  @Post('calcular')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Simular totales, descuentos, IVA y retenciones sin persistir' })
  calcularTotales(@Body() dto: CalcularFacturaDto) {
    return this.ventasService.calcular(dto);
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Consultar detalle completo de la factura de venta' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ventasService.findFacturaById(id);
  }

  @Get(':id/pdf')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Obtener enlace de descarga del PDF de la factura' })
  async getPdf(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ventasService.getFacturaPdf(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({
    summary: 'Crear factura de venta transaccional',
    description:
      'Registra factura, descarga stock en kardex, aplica consecutivo y genera cuenta por cobrar.',
  })
  async create(@Body() dto: CreateFacturaVentaDto) {
    return this.ventasService.createFactura(dto);
  }

  @Patch(':id')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Modificar campos no financieros de la factura' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFacturaVentaDto,
  ) {
    return this.ventasService.updateFactura(id, dto);
  }

  @Post(':id/anular')
  @RequirePermission('ventas.anular')
  @ApiOperation({ summary: 'Anular factura de venta y reversar stock (solo Administrador)' })
  async anular(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AnularDocumentoDto,
  ) {
    return this.ventasService.anularFactura(id, dto);
  }
}
