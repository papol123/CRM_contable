import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SiigoService, GuardarCredencialesSiigoDto } from './siigo.service';
import { RequirePermission } from '../auth/decorators/permissions.decorator';

@ApiTags('Integración Siigo')
@ApiBearerAuth()
@RequirePermission('siigo.gestionar')
@Controller('integraciones/siigo')
export class SiigoController {
  constructor(private readonly siigoService: SiigoService) {}

  @Get('estado')
  @ApiOperation({ summary: 'Consultar estado de la conexión e integración con Siigo' })
  async getEstado() {
    return this.siigoService.getEstado();
  }

  @Put('credenciales')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar credenciales de acceso a Siigo (protegidas en Secret Manager)' })
  async guardarCredenciales(@Body() dto: GuardarCredencialesSiigoDto) {
    return this.siigoService.guardarCredenciales(dto);
  }

  @Post('probar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Probar conexión inmediata con el API de Siigo' })
  async probarConexion() {
    return this.siigoService.probarConexion();
  }

  @Post('sincronizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sincronización bidireccional completa' })
  async sincronizarCompleta() {
    return this.siigoService.sincronizar('COMPLETA');
  }

  @Post('sincronizar/clientes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar catálogo de clientes con Siigo' })
  async sincronizarClientes() {
    return this.siigoService.sincronizar('CLIENTES');
  }

  @Post('sincronizar/productos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar catálogo de productos y precios con Siigo' })
  async sincronizarProductos() {
    return this.siigoService.sincronizar('PRODUCTOS');
  }

  @Post('sincronizar/ventas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar facturas de venta pendientes hacia Siigo' })
  async sincronizarVentas() {
    return this.siigoService.sincronizar('VENTAS');
  }

  @Get('sincronizaciones')
  @ApiOperation({ summary: 'Consultar historial de ejecuciones de sincronización' })
  async getHistorial() {
    return this.siigoService.getHistorialSincronizaciones();
  }

  @Get('sincronizaciones/:id')
  @ApiOperation({ summary: 'Consultar detalle y errores de una sincronización' })
  async getDetalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.siigoService.getSincronizacionById(id);
  }

  @Post('sincronizaciones/:id/reintentar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reintentar procesamiento de sincronización fallida' })
  async reintentar(@Param('id', ParseUUIDPipe) id: string) {
    return this.siigoService.reintentarSincronizacion(id);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Consultar logs técnicos de la integración con Siigo' })
  async getLogs() {
    return this.siigoService.getLogs();
  }
}
