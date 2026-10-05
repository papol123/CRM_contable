import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../../package.json');

@ApiTags('Salud y Sistema')
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  @ApiResponse({ status: 200, description: 'Servicio en línea' })
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Versión desplegada' })
  getVersion() {
    return {
      name: 'CRM Contable — Repuestos Automotrices API',
      version,
      apiVersion: 'v1',
      // Cloud Run publica la revisión desplegada en K_REVISION
      revision: process.env.K_REVISION || null,
      commit: process.env.GIT_COMMIT || null,
    };
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness: Cloud SQL y almacenamiento de archivos disponibles' })
  @ApiResponse({ status: 200, description: 'Todas las dependencias operativas' })
  @ApiResponse({ status: 503, description: 'Una o más dependencias no disponibles' })
  async getHealthReady(@Res() res: Response) {
    const inicio = Date.now();
    let database: { status: 'up' | 'down'; latencyMs?: number } = { status: 'down' };
    try {
      await this.dataSource.query('SELECT 1');
      database = { status: 'up', latencyMs: Date.now() - inicio };
    } catch {
      database = { status: 'down' };
    }

    const storage = await this.almacenamiento.verificar();
    const listo = database.status === 'up' && storage.status === 'up';

    // No se exponen mensajes de error internos en un endpoint público
    return res.status(listo ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: listo ? 'ready' : 'unavailable',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        storage: { status: storage.status, driver: storage.driver },
      },
    });
  }
}
