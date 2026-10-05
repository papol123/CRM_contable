import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Salud y Sistema')
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Verificación de liveness y estado del servicio' })
  @ApiResponse({ status: 200, description: 'Servicio en línea y operativo' })
  getHealth() {
    return {
      status: 'ok',
      service: 'crm-contable-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Consultar versión y metadatos de la API' })
  @ApiResponse({ status: 200, description: 'Versión del sistema' })
  getVersion() {
    return {
      name: 'CRM Contable — Repuestos Automotrices API',
      version: '1.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
      apiVersion: 'v1',
    };
  }
}
