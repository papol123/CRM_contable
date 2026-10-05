import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { FacturasVentaService } from '../facturas-venta.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Auditar } from '../../auditoria/auditar';
import { Idempotente } from '../../../common/idempotencia/idempotencia';
import { archivo } from '../../../common/archivos/respuesta-archivo';
import {
  CreateFacturaVentaDto,
  CalcularFacturaDto,
  ConsultaRemisionesDto,
  UpdateFacturaVentaDto,
  AnularDocumentoDto,
} from '../dto/factura-venta.dto';

/**
 * Ventas por REMISIÓN. Se conserva la ruta /facturas-venta del catálogo;
 * no hay facturación electrónica DIAN.
 */
@ApiTags('Ventas (remisiones)')
@ApiBearerAuth()
@Controller('facturas-venta')
export class FacturasVentaController {
  constructor(private readonly facturasService: FacturasVentaService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar remisiones (paginado; filtra por texto, cliente, estado y fechas; incluye saldo)' })
  async findAll(@Query() filtros: ConsultaRemisionesDto) {
    return this.facturasService.findAllFacturas(filtros);
  }

  @Get('siguiente-consecutivo')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Próximo número de remisión (no lo reserva)' })
  async getSiguienteConsecutivo() {
    return this.facturasService.getSiguienteConsecutivo();
  }

  @Post('calcular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Simular totales, descuentos, IVA y retenciones sin guardar' })
  calcularTotales(@Body() dto: CalcularFacturaDto) {
    return this.facturasService.calcular(dto);
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Detalle de la remisión con pagos aplicados y saldo' })
  @ApiResponse({ status: 404, description: 'Remisión no encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.facturasService.findFacturaById(id);
  }

  @Get(':id/pdf')
  @RequirePermission('ventas.consultar')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descargar la remisión en PDF' })
  async getPdf(@Param('id', ParseUUIDPipe) id: string) {
    const { contenido, nombre } = await this.facturasService.getFacturaPdf(id);
    return archivo(contenido, nombre, 'application/pdf');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @Idempotente()
  @ApiOperation({
    summary: 'Crear remisión (transaccional e idempotente)',
    description:
      'En una transacción: valida stock, periodo abierto, cupo y bloqueo de crédito; toma el consecutivo REM; ' +
      'calcula IVA y descuentos por línea; descarga el kardex a costo promedio y deja la cuenta por cobrar si es a crédito. ' +
      'Envíe Idempotency-Key para que un reintento no duplique la venta.',
  })
  @ApiResponse({ status: 409, description: 'Stock insuficiente' })
  @ApiResponse({ status: 422, description: 'Cupo insuficiente, crédito bloqueado, cliente inactivo o periodo cerrado' })
  async create(@Body() dto: CreateFacturaVentaDto, @Actor() actor: Actor) {
    return this.facturasService.createFactura(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('ventas.crear')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'facturas_venta', registrarCuerpo: true })
  @ApiOperation({ summary: 'Modificar campos no financieros (vencimiento, observaciones)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacturaVentaDto) {
    return this.facturasService.updateFactura(id, dto);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.anular')
  @ApiOperation({ summary: 'Anular remisión con motivo: devuelve el stock con movimientos compensatorios' })
  @ApiResponse({ status: 409, description: 'Ya anulada, castigada o con pagos aplicados' })
  @ApiResponse({ status: 422, description: 'Periodo contable cerrado' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto, @Actor() actor: Actor) {
    return this.facturasService.anularFactura(id, dto.motivo, actor);
  }
}
