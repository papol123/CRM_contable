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
import { VentasService } from '../ventas.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import {
  CreateCotizacionDto,
  RechazarCotizacionDto,
  UpdateEstadoPedidoDto,
  CreateResolucionDianDto,
  UpdateResolucionDianDto,
} from '../dto/ventas-documentos.dto';

@ApiTags('Cotizaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar cotizaciones' })
  async findAll() {
    return this.ventasService.findAllCotizaciones();
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Consultar detalle de cotización' })
  async findOne(@Param('id') id: string) {
    return this.ventasService.findCotizacionById(id);
  }

  @Get(':id/pdf')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Descargar PDF de cotización' })
  async getPdf(@Param('id') id: string) {
    return {
      urlDescarga: `https://storage.crmcontable.com/cotizaciones-pdf/${id}.pdf?token=demo`,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Crear cotización' })
  async create(@Body() dto: CreateCotizacionDto) {
    return this.ventasService.createCotizacion(dto);
  }

  @Post(':id/aprobar')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Aprobar cotización' })
  async aprobar(@Param('id') id: string) {
    return this.ventasService.aprobarCotizacion(id);
  }

  @Post(':id/rechazar')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Rechazar cotización con motivo' })
  async rechazar(@Param('id') id: string, @Body() dto: RechazarCotizacionDto) {
    return this.ventasService.rechazarCotizacion(id, dto);
  }

  @Post(':id/convertir-pedido')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Convertir cotización en pedido formal' })
  async convertir(@Param('id') id: string) {
    return this.ventasService.convertirCotizacionAPedido(id);
  }
}

@ApiTags('Pedidos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar pedidos' })
  async findAll() {
    return this.ventasService.findAllPedidos();
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Consultar detalle y trazabilidad de pedido' })
  async findOne(@Param('id') id: string) {
    return this.ventasService.findPedidoById(id);
  }

  @Patch(':id/estado')
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Actualizar estado del pedido (recibido → proceso → enviado → entregado)' })
  async updateEstado(@Param('id') id: string, @Body() dto: UpdateEstadoPedidoDto) {
    return this.ventasService.updateEstadoPedido(id, dto);
  }

  @Post(':id/anular')
  @RequirePermission('ventas.anular')
  @ApiOperation({ summary: 'Anular pedido (solo Administrador)' })
  async anular(@Param('id') id: string) {
    return this.ventasService.anularPedido(id);
  }
}

@ApiTags('Resoluciones y Consecutivos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ResolucionesController {
  constructor(private readonly ventasService: VentasService) {}

  @Get('resoluciones')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Listar resoluciones DIAN registradas' })
  async getResoluciones() {
    return this.ventasService.getResoluciones();
  }

  @Get('resoluciones/activa')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Consultar resolución DIAN activa/vigente' })
  async getResolucionActiva() {
    return this.ventasService.getResolucionActiva();
  }

  @Post('resoluciones')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Registrar nueva resolución DIAN' })
  async createResolucion(@Body() dto: CreateResolucionDianDto) {
    return this.ventasService.createResolucion(dto);
  }

  @Patch('resoluciones/:id')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Actualizar resolución DIAN' })
  async updateResolucion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateResolucionDianDto,
  ) {
    return this.ventasService.updateResolucion(id, dto);
  }

  @Get('consecutivos')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Consultar estado actual de consecutivos de documentos' })
  async getConsecutivos() {
    return this.ventasService.getConsecutivos();
  }
}
