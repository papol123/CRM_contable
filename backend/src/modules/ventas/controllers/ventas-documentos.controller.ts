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
import { FacturasVentaService } from '../facturas-venta.service';
import { CotizacionesService } from '../cotizaciones.service';
import { PedidosService } from '../pedidos.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateCotizacionDto,
  UpdateCotizacionDto,
  RechazarCotizacionDto,
  ConvertirCotizacionDto,
  CreatePedidoDto,
  UpdateEstadoPedidoDto,
  FacturarPedidoDto,
  AnularPedidoDto,
  CreateResolucionDianDto,
  UpdateResolucionDianDto,
} from '../dto/ventas-documentos.dto';

@ApiTags('Cotizaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar cotizaciones' })
  @ApiQuery({ name: 'estado', required: false, enum: ['BORRADOR', 'APROBADA', 'RECHAZADA', 'CONVERTIDA'] })
  @ApiQuery({ name: 'clienteId', required: false })
  async findAll(@Query('estado') estado?: string, @Query('clienteId') clienteId?: string) {
    return this.cotizacionesService.findAll(estado, clienteId);
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Detalle de cotización con totales' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cotizacionesService.findById(id);
  }

  @Get(':id/pdf')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'PDF de cotización (pendiente: responde 501)' })
  @ApiResponse({ status: 501, description: 'Generación de PDF no implementada' })
  async getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return this.cotizacionesService.getPdf(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Crear cotización (en BORRADOR)' })
  async create(@Body() dto: CreateCotizacionDto, @CurrentUser('id') idUsuario: string) {
    return this.cotizacionesService.create(dto, idUsuario);
  }

  @Patch(':id')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Editar cotización (solo en BORRADOR)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCotizacionDto) {
    return this.cotizacionesService.update(id, dto);
  }

  @Post(':id/aprobar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Aprobar cotización' })
  async aprobar(@Param('id', ParseUUIDPipe) id: string) {
    return this.cotizacionesService.aprobar(id);
  }

  @Post(':id/rechazar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Rechazar cotización con motivo' })
  async rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RechazarCotizacionDto) {
    return this.cotizacionesService.rechazar(id, dto.motivo);
  }

  @Post(':id/convertir-pedido')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Convertir cotización en pedido (reserva stock)' })
  @ApiResponse({ status: 409, description: 'Estado no válido, vencida, sin items o sin stock' })
  async convertir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertirCotizacionDto,
    @CurrentUser('id') idUsuario: string,
  ) {
    return this.cotizacionesService.convertirAPedido(id, dto, idUsuario);
  }
}

@ApiTags('Pedidos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar pedidos' })
  @ApiQuery({ name: 'estado', required: false })
  @ApiQuery({ name: 'clienteId', required: false })
  async findAll(@Query('estado') estado?: string, @Query('clienteId') clienteId?: string) {
    return this.pedidosService.findAll(estado, clienteId);
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Detalle del pedido con trazabilidad' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pedidosService.findById(id);
  }

  @Get(':id/trazabilidad')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Historial de estados del pedido' })
  async trazabilidad(@Param('id', ParseUUIDPipe) id: string) {
    return this.pedidosService.findTrazabilidad(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Crear pedido (reserva stock)' })
  @ApiResponse({ status: 409, description: 'Stock insuficiente' })
  async create(@Body() dto: CreatePedidoDto, @CurrentUser('id') idUsuario: string) {
    return this.pedidosService.create(dto, idUsuario);
  }

  @Patch(':id/estado')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Avanzar estado: RECIBIDO → EN_PROCESO → ENVIADO → ENTREGADO' })
  @ApiResponse({ status: 409, description: 'Transición no permitida' })
  async updateEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEstadoPedidoDto,
    @CurrentUser('id') idUsuario: string,
  ) {
    return this.pedidosService.updateEstado(id, dto, idUsuario);
  }

  @Post(':id/facturar')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Generar la factura de venta del pedido' })
  async facturar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FacturarPedidoDto,
    @CurrentUser('id') idUsuario: string,
  ) {
    return this.pedidosService.facturar(id, dto, idUsuario);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.anular')
  @ApiOperation({ summary: 'Anular pedido y liberar la reserva (solo Administrador)' })
  async anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularPedidoDto,
    @CurrentUser('id') idUsuario: string,
  ) {
    return this.pedidosService.anular(id, dto?.motivo, idUsuario);
  }
}

@ApiTags('Resoluciones y Consecutivos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ResolucionesController {
  constructor(private readonly facturasService: FacturasVentaService) {}

  @Get('resoluciones')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Listar resoluciones DIAN registradas' })
  async getResoluciones() {
    return this.facturasService.getResoluciones();
  }

  @Get('resoluciones/activa')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Resolución DIAN vigente' })
  async getResolucionActiva() {
    return this.facturasService.getResolucionActiva();
  }

  @Post('resoluciones')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Registrar nueva resolución DIAN' })
  async createResolucion(@Body() dto: CreateResolucionDianDto) {
    return this.facturasService.createResolucion(dto);
  }

  @Patch('resoluciones/:id')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar resolución DIAN' })
  async updateResolucion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateResolucionDianDto) {
    return this.facturasService.updateResolucion(id, dto);
  }

  @Get('consecutivos')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Estado actual de los consecutivos de documentos' })
  async getConsecutivos() {
    return this.facturasService.getConsecutivos();
  }
}
