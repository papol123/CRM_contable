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
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ComprasService } from '../compras.service';
import { CarteraService } from '../cartera.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateFacturaCompraDto, UpdateFacturaCompraDto } from '../dto/factura-compra.dto';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';

@ApiTags('Facturas de Compra')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturas-compra')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Get()
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Listar facturas de compra (incluye saldo)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'proveedorId', required: false })
  async findAll(@Query('search') search?: string, @Query('proveedorId') proveedorId?: string) {
    return this.comprasService.findAll(search, proveedorId);
  }

  @Get(':id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Detalle de factura de compra' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.comprasService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Registrar factura de compra y cargar inventario' })
  @ApiResponse({ status: 409, description: 'Número de factura o CUFE duplicado para el proveedor' })
  async create(@Body() dto: CreateFacturaCompraDto, @CurrentUser('id') idUsuario: string) {
    return this.comprasService.create(dto, idUsuario);
  }

  @Patch(':id')
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Editar campos no financieros de factura de compra' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacturaCompraDto) {
    return this.comprasService.update(id, dto);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('compras.anular')
  @ApiOperation({ summary: 'Anular factura de compra y reversar inventario (solo Administrador)' })
  @ApiResponse({ status: 409, description: 'Ya anulada, con pagos o con mercancía ya vendida' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto) {
    return this.comprasService.anular(id, dto.motivo);
  }
}

@ApiTags('Cartera y Cuentas por Cobrar / Pagar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get('cuentas-por-cobrar')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Facturas de venta con saldo pendiente' })
  @ApiQuery({ name: 'clienteId', required: false })
  async getCuentasPorCobrar(@Query('clienteId') clienteId?: string) {
    return this.carteraService.getCuentasPorCobrar(clienteId);
  }

  @Get('cuentas-por-cobrar/:id')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Detalle de una cuenta por cobrar (id de la factura de venta)' })
  async getCuentaPorCobrar(@Param('id', ParseUUIDPipe) id: string) {
    return this.carteraService.getCuentaPorCobrar(id);
  }

  @Get('cartera/morosos')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Clientes con facturas vencidas' })
  async getMorosos() {
    return this.carteraService.getMorosos();
  }

  @Get('cartera/vencida')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Cartera por edades de vencimiento (1-30, 31-60, 61-90, +90)' })
  async getCarteraVencida() {
    return this.carteraService.getCarteraVencida();
  }

  @Get('cartera/resumen')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Resumen consolidado de cartera' })
  async getCarteraResumen() {
    return this.carteraService.getCarteraResumen();
  }

  @Get('cuentas-por-pagar')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Facturas de compra con saldo pendiente' })
  @ApiQuery({ name: 'proveedorId', required: false })
  async getCuentasPorPagar(@Query('proveedorId') proveedorId?: string) {
    return this.carteraService.getCuentasPorPagar(proveedorId);
  }

  @Get('cuentas-por-pagar/proximas-vencer')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Cuentas por pagar que vencen en los próximos X días' })
  @ApiQuery({ name: 'dias', required: false, example: 7 })
  async getProximasVencer(@Query('dias', new ParseIntPipe({ optional: true })) dias?: number) {
    return this.carteraService.getCuentasPorPagarProximasVencer(dias ?? 7);
  }

  @Get('cuentas-por-pagar/vencidas')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Cuentas por pagar vencidas' })
  async getVencidas() {
    return this.carteraService.getCuentasPorPagarVencidas();
  }

  @Get('cuentas-por-pagar/:id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Detalle de una cuenta por pagar (id de la factura de compra)' })
  async getCuentaPorPagar(@Param('id', ParseUUIDPipe) id: string) {
    return this.carteraService.getCuentaPorPagar(id);
  }

  @Post('cuentas-por-cobrar/:id/castigar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Castigar cartera vencida incobrable (solo Administrador)' })
  async castigar(@Param('id', ParseUUIDPipe) id: string) {
    return this.carteraService.castigarCartera(id);
  }
}
