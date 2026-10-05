import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MantenimientoService } from './mantenimiento.service';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Actor } from '../auth/decorators/actor.decorator';
import { PaginacionDto } from '../../common/paginacion/paginacion';

export class ConsultaJobsDto extends PaginacionDto {
  @ApiPropertyOptional({ example: 'EXPORTAR_REPORTE' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo?: string;

  @ApiPropertyOptional({ enum: ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO'] })
  @IsOptional()
  @IsIn(['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO'])
  estado?: string;
}

export class EjecutarBackupDto {
  @ApiPropertyOptional({ example: 'Antes del cierre anual' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

@ApiTags('Operación y Mantenimiento')
@ApiBearerAuth()
@RequirePermission('mantenimiento.gestionar')
@Controller('admin')
export class MantenimientoController {
  constructor(private readonly mantenimientoService: MantenimientoService) {}

  @Get('metricas')
  @ApiOperation({ summary: 'Peticiones, latencia (p50/p95/p99), errores, memoria, base de datos y jobs' })
  async getMetricas() {
    return this.mantenimientoService.getMetricas();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Tareas asíncronas (paginado; filtra por tipo y estado)' })
  async getJobs(@Query() filtros: ConsultaJobsDto) {
    return this.mantenimientoService.getJobs(filtros);
  }

  @Post('jobs/:id/reintentar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reintentar una tarea FALLIDA' })
  @ApiResponse({ status: 409, description: 'La tarea no está fallida' })
  async reintentarJob(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: Actor) {
    return this.mantenimientoService.reintentarJob(id, actor);
  }

  @Get('backups')
  @ApiOperation({ summary: 'Respaldos de Cloud SQL y solicitudes de respaldo hechas desde el CRM' })
  async getBackups() {
    return this.mantenimientoService.getBackups();
  }

  @Post('backups')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Ejecutar un respaldo bajo demanda de Cloud SQL (asíncrono, uno a la vez)' })
  @ApiResponse({ status: 202, description: 'Respaldo encolado' })
  @ApiResponse({ status: 409, description: 'Ya hay un respaldo en curso' })
  @ApiResponse({ status: 503, description: 'Cloud SQL Admin no configurado' })
  async ejecutarBackup(@Body() dto: EjecutarBackupDto, @Actor() actor: Actor) {
    return this.mantenimientoService.ejecutarBackup(dto.motivo, actor);
  }

  @Get('almacenamiento')
  @ApiOperation({ summary: 'Uso del almacenamiento de archivos (Cloud Storage o disco local)' })
  async getAlmacenamiento() {
    return this.mantenimientoService.getAlmacenamiento();
  }
}
