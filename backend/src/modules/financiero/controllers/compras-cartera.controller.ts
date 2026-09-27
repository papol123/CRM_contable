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
import { FinancieroService } from '../financiero.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import {
  CreateFacturaCompraDto,
  UpdateFacturaCompraDto,
} from '../dto/factura-compra.dto';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';

@ApiTags('Facturas de Compra')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturas-compra')
export class ComprasController {
  constructor(private readonly financieroService: FinancieroService) {}

  @Get()
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Listar facturas de compra' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'proveedorId', required: false })
  async findAll(
    @Query('search') search?: string,
    @Query('proveedorId') proveedorId?: string,
  ) {
    return this.financieroService.findAllCompras(search, proveedorId);
  }

  @Get(':id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Consultar detalle de factura de compra' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financieroService.findCompraById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Registrar factura de compra y cargar inventario' })
  async create(@Body() dto: CreateFacturaCompraDto) {
    return this.financieroService.createCompra(dto);
  }

  @Patch(':id')
  @RequirePermission('compras.crear')
  @ApiOperation({ summary: 'Editar campos no financieros de factura de compra' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFacturaCompraDto,
  ) {
    return this.financieroService.updateCompra(id, dto);
  }

  @Post(':id/anular')
  @RequirePermission('compras.anular')
  @ApiOperation({ summary: 'Anular factura de compra (solo Administrador)' })
  async anular(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AnularDocumentoDto,
  ) {
    return this.financieroService.anularCompra(id, dto.motivo);
  }
}

@ApiTags('Cartera y Cuentas por Cobrar / Pagar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CarteraController {
  constructor(private readonly financieroService: FinancieroService) {}

  @Get('cuentas-por-cobrar')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Listar cuentas por cobrar activas' })
  async getCuentasPorCobrar() {
    return this.financieroService.getCuentasPorCobrar();
  }

  @Get('cartera/morosos')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Listado de clientes con facturas en mora' })
  async getMorosos() {
    return this.financieroService.getMorosos();
  }

  @Get('cartera/vencida')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Cartera por edades de vencimiento (1-30, 31-60, 61-90, +90)' })
  async getCarteraVencida() {
    return this.financieroService.getCarteraVencida();
  }

  @Get('cartera/resumen')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Resumen consolidado de cartera y saldos' })
  async getCarteraResumen() {
    return this.financieroService.getCarteraResumen();
  }

  @Get('cuentas-por-pagar')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Listar cuentas por pagar a proveedores' })
  async getCuentasPorPagar() {
    return this.financieroService.getCuentasPorPagar();
  }

  @Get('cuentas-por-pagar/proximas-vencer')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Cuentas por pagar próximas a vencer en X días' })
  async getProximasVencer(@Query('dias') dias?: number) {
    return this.financieroService.getCuentasPorPagarProximasVencer(dias);
  }

  @Get('cuentas-por-pagar/vencidas')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Cuentas por pagar vencidas' })
  async getVencidas() {
    return this.financieroService.getCuentasPorPagarVencidas();
  }

  @Post('cuentas-por-cobrar/:id/castigar')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Castigar cartera incobrable (solo Administrador)' })
  async castigar(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financieroService.castigarCartera(id);
  }
}
