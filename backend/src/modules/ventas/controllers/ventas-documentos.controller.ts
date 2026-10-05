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
import { CotizacionesService } from '../cotizaciones.service';
import { PedidosService } from '../pedidos.service';
import { ConsecutivosService } from '../consecutivos.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Auditar } from '../../auditoria/auditar';
import { Idempotente } from '../../../common/idempotencia/idempotencia';
import { archivo } from '../../../common/archivos/respuesta-archivo';
import {
  AjustarConsecutivoDto,
  ConsultaCotizacionesDto,
  ConsultaPedidosDto,
  CreateCotizacionDto,
  UpdateCotizacionDto,
  RechazarCotizacionDto,
  ConvertirCotizacionDto,
  EnviarCotizacionDto,
  CreatePedidoDto,
  UpdateEstadoPedidoDto,
  FacturarPedidoDto,
  AnularPedidoDto,
} from '../dto/ventas-documentos.dto';

@ApiTags('Cotizaciones')
@ApiBearerAuth()
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar cotizaciones (paginado, filtra por estado y cliente)' })
  async findAll(@Query() filtros: ConsultaCotizacionesDto) {
    return this.cotizacionesService.findAll(filtros);
  }

  @Get(':id')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Detalle de cotización con totales' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cotizacionesService.findById(id);
  }

  @Get(':id/pdf')
  @RequirePermission('ventas.consultar')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descargar la cotización en PDF' })
  async getPdf(@Param('id', ParseUUIDPipe) id: string) {
    const { contenido, nombre } = await this.cotizacionesService.generarPdf(id);
    return archivo(contenido, nombre, 'application/pdf');
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
  @ApiOperation({ summary: 'Editar cotización (solo en BORRADOR; una aprobada no se edita)' })
  @ApiResponse({ status: 409, description: 'La cotización no está en BORRADOR' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCotizacionDto) {
    return this.cotizacionesService.update(id, dto);
  }

  @Post(':id/aprobar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @Auditar({ accion: 'APROBAR', recurso: 'cotizaciones' })
  @ApiOperation({ summary: 'Aprobar cotización' })
  async aprobar(@Param('id', ParseUUIDPipe) id: string) {
    return this.cotizacionesService.aprobar(id);
  }

  @Post(':id/enviar')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('ventas.crear')
  @ApiOperation({
    summary: 'Generar el PDF, guardarlo y enviarlo por correo al cliente (asíncrono)',
    description: 'Responde 202 con el job. Consulte el avance en GET /reportes/jobs/{jobId}.',
  })
  @ApiResponse({ status: 202, description: 'Envío encolado' })
  @ApiResponse({ status: 422, description: 'Cliente sin correo o correo no configurado' })
  async enviar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnviarCotizacionDto, @CurrentUser('id') idUsuario: string) {
    return this.cotizacionesService.enviarPdf(id, dto.email, idUsuario);
  }

  @Post(':id/rechazar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @Auditar({ accion: 'RECHAZAR', recurso: 'cotizaciones' })
  @ApiOperation({ summary: 'Rechazar cotización con motivo' })
  async rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RechazarCotizacionDto) {
    return this.cotizacionesService.rechazar(id, dto.motivo);
  }

  @Post(':id/convertir-pedido')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('ventas.crear')
  @Auditar({ accion: 'CONVERTIR_PEDIDO', recurso: 'cotizaciones' })
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
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get()
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Listar pedidos (paginado, filtra por estado y cliente)' })
  async findAll(@Query() filtros: ConsultaPedidosDto) {
    return this.pedidosService.findAll(filtros);
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
  @Idempotente()
  @ApiOperation({ summary: 'Generar la remisión del pedido (transaccional e idempotente)' })
  async facturar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FacturarPedidoDto, @Actor() actor: Actor) {
    return this.pedidosService.facturar(id, dto, actor);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.anular')
  @ApiOperation({ summary: 'Anular pedido con motivo y liberar la reserva de stock' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularPedidoDto, @Actor() actor: Actor) {
    return this.pedidosService.anular(id, dto.motivo, actor);
  }
}

/** Numeración interna de documentos. No hay resoluciones DIAN (fuera de alcance). */
@ApiTags('Consecutivos')
@ApiBearerAuth()
@RequirePermission('consecutivos.gestionar')
@Controller('consecutivos')
export class ConsecutivosController {
  constructor(private readonly consecutivos: ConsecutivosService) {}

  @Get()
  @ApiOperation({ summary: 'Estado de los consecutivos (remisiones, conteos, cotizaciones, pedidos)' })
  async getConsecutivos() {
    return this.consecutivos.listar();
  }

  @Patch(':tipo')
  @ApiOperation({
    summary: 'Ajustar prefijo o siguiente número (siempre auditado)',
    description: 'Tipos: REMISION, CONTEO, COTIZACION, PEDIDO. No se permite retroceder por debajo de un número ya emitido.',
  })
  @ApiResponse({ status: 409, description: 'El siguiente número no es mayor que el último emitido' })
  async updateConsecutivo(@Param('tipo') tipo: string, @Body() dto: AjustarConsecutivoDto, @Actor() actor: Actor) {
    return this.consecutivos.ajustar(tipo, dto, actor);
  }
}
