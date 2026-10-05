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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ComprasService } from '../compras.service';
import { CarteraService } from '../cartera.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Auditar } from '../../auditoria/auditar';
import { Idempotente } from '../../../common/idempotencia/idempotencia';
import { archivo } from '../../../common/archivos/respuesta-archivo';
import { ArchivoSubido } from '../../../common/archivos/adjuntos.service';
import { TAMANO_MAXIMO_ADJUNTO } from '../../../common/almacenamiento/almacenamiento.service';
import { paginarArreglo } from '../../../common/paginacion/paginacion';
import {
  ConsultaComprasDto,
  CreateFacturaCompraDto,
  ImportarXmlDto,
  UpdateFacturaCompraDto,
} from '../dto/factura-compra.dto';
import {
  ConsultaCuentasCobrarDto,
  ConsultaCuentasPagarDto,
  ProximasVencerDto,
  RecordatoriosDto,
} from '../dto/cartera.dto';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';

const SUBIDA = FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ADJUNTO, files: 1 } });
const ESQUEMA_ARCHIVO = {
  schema: {
    type: 'object',
    properties: { archivo: { type: 'string', format: 'binary' }, idProveedor: { type: 'string', format: 'uuid' } },
    required: ['archivo'],
  },
};

@ApiTags('Facturas de Compra')
@ApiBearerAuth()
@Controller('facturas-compra')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Get()
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Listar facturas de compra con saldo (paginado; filtra por texto, proveedor y fechas)' })
  async findAll(@Query() filtros: ConsultaComprasDto) {
    return this.comprasService.findAll(filtros);
  }

  @Post('importar-xml')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('compras.crear')
  @UseInterceptors(SUBIDA)
  @ApiConsumes('multipart/form-data')
  @ApiBody(ESQUEMA_ARCHIVO)
  @ApiOperation({
    summary: 'Leer la factura electrónica (XML UBL) del proveedor y devolver la precarga de la compra',
    description: 'No guarda nada. Identifica proveedor por NIT y productos por código; devuelve advertencias para revisar.',
  })
  @ApiResponse({ status: 422, description: 'El archivo no es una factura UBL válida' })
  async importarXml(@UploadedFile() xml: ArchivoSubido, @Body() dto: ImportarXmlDto) {
    if (!xml?.buffer?.length) throw new BadRequestException('Adjunte el XML en el campo "archivo"');
    return this.comprasService.importarXml(xml.buffer, dto.idProveedor);
  }

  @Get(':id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Detalle de factura de compra con retenciones y saldo' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.comprasService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras.crear')
  @Idempotente()
  @ApiOperation({
    summary: 'Registrar factura de proveedor (transaccional e idempotente)',
    description: 'Aplica descuentos, IVA, ReteFuente, ReteIVA y ReteICA; carga inventario al costo neto y crea la cuenta por pagar.',
  })
  @ApiResponse({ status: 409, description: 'Número de factura o CUFE duplicado para el proveedor' })
  @ApiResponse({ status: 422, description: 'Proveedor inactivo, retenciones mayores al total o periodo cerrado' })
  async create(@Body() dto: CreateFacturaCompraDto, @Actor() actor: Actor) {
    return this.comprasService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('compras.crear')
  @Auditar({ accion: 'ACTUALIZAR', recurso: 'facturas_compra', registrarCuerpo: true })
  @ApiOperation({ summary: 'Editar campos no financieros (número y vencimiento)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacturaCompraDto) {
    return this.comprasService.update(id, dto);
  }

  @Post(':id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('compras.crear')
  @Auditar({ accion: 'ADJUNTAR', recurso: 'facturas_compra' })
  @UseInterceptors(SUBIDA)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] } })
  @ApiOperation({ summary: 'Subir PDF o XML de la factura del proveedor (máx. 10 MB)' })
  @ApiResponse({ status: 415, description: 'Tipo de archivo no permitido' })
  async addAdjunto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() adjunto: ArchivoSubido) {
    return this.comprasService.adjuntarArchivo(id, adjunto);
  }

  @Get(':id/adjuntos')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Adjuntos de la factura de compra' })
  async getAdjuntos(@Param('id', ParseUUIDPipe) id: string) {
    return this.comprasService.getAdjuntos(id);
  }

  @Get(':id/adjuntos/:idAdjunto')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Descargar un adjunto de la factura de compra' })
  async descargarAdjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('idAdjunto', ParseUUIDPipe) idAdjunto: string,
  ) {
    const { contenido, nombre, tipoMime } = await this.comprasService.descargarAdjunto(id, idAdjunto);
    return archivo(contenido, nombre, tipoMime, 'attachment');
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('compras.anular')
  @ApiOperation({ summary: 'Anular compra con motivo: reversa el inventario y cierra la cuenta por pagar' })
  @ApiResponse({ status: 409, description: 'Ya anulada, con pagos o con mercancía ya vendida' })
  async anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto, @Actor() actor: Actor) {
    return this.comprasService.anular(id, dto.motivo, actor);
  }
}

@ApiTags('Cartera y Cuentas por Cobrar / Pagar')
@ApiBearerAuth()
@Controller()
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get('cuentas-por-cobrar')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Remisiones con saldo pendiente (paginado)' })
  async getCuentasPorCobrar(@Query() q: ConsultaCuentasCobrarDto) {
    return paginarArreglo(await this.carteraService.getCuentasPorCobrar(q.clienteId), q);
  }

  @Get('cuentas-por-cobrar/:id')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Detalle de una cuenta por cobrar con sus abonos (id de la remisión)' })
  async getCuentaPorCobrar(@Param('id', ParseUUIDPipe) id: string) {
    return this.carteraService.getCuentaPorCobrar(id);
  }

  @Post('cuentas-por-cobrar/:id/castigar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('cartera.gestionar')
  @ApiOperation({ summary: 'Castigar cuenta incobrable vencida (motivo obligatorio, auditado)' })
  @ApiResponse({ status: 422, description: 'No está vencida o el periodo está cerrado' })
  async castigar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDocumentoDto, @Actor() actor: Actor) {
    return this.carteraService.castigarCartera(id, dto.motivo, actor);
  }

  @Get('cartera/morosos')
  @RequirePermission('cartera.consultar')
  @ApiOperation({ summary: 'Clientes con remisiones vencidas' })
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

  @Post('cartera/recordatorios')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('cartera.gestionar')
  @ApiOperation({ summary: 'Enviar recordatorios de cobro por correo a clientes en mora (asíncrono)' })
  @ApiResponse({ status: 202, description: 'Envío encolado' })
  @ApiResponse({ status: 409, description: 'Ya hay un envío de recordatorios en curso' })
  async enviarRecordatorios(@Body() dto: RecordatoriosDto, @Actor() actor: Actor) {
    return this.carteraService.enviarRecordatorios(dto, actor);
  }

  @Get('cuentas-por-pagar')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Facturas de compra con saldo pendiente (paginado)' })
  async getCuentasPorPagar(@Query() q: ConsultaCuentasPagarDto) {
    return paginarArreglo(await this.carteraService.getCuentasPorPagar(q.proveedorId), q);
  }

  @Get('cuentas-por-pagar/proximas-vencer')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Cuentas por pagar que vencen en los próximos N días' })
  async getProximasVencer(@Query() q: ProximasVencerDto) {
    return paginarArreglo(await this.carteraService.getCuentasPorPagarProximasVencer(q.dias ?? 7), q);
  }

  @Get('cuentas-por-pagar/vencidas')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Cuentas por pagar vencidas' })
  async getVencidas(@Query() q: ConsultaCuentasPagarDto) {
    return paginarArreglo(await this.carteraService.getCuentasPorPagarVencidas(), q);
  }

  @Get('cuentas-por-pagar/:id')
  @RequirePermission('compras.consultar')
  @ApiOperation({ summary: 'Detalle de una cuenta por pagar (id de la factura de compra)' })
  async getCuentaPorPagar(@Param('id', ParseUUIDPipe) id: string) {
    return this.carteraService.getCuentaPorPagar(id);
  }
}
