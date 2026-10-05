import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuditoriaService } from './auditoria.service';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginacionDto } from '../../common/paginacion/paginacion';
import { JobsService } from '../../common/jobs/jobs.service';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { generarCsv } from '../../common/exportacion/csv';

export class FiltrosAuditoriaDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @ApiPropertyOptional({ example: 'ANULAR' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accion?: string;

  @ApiPropertyOptional({ example: 'facturas_venta' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  recurso?: string;

  @ApiPropertyOptional({ enum: ['EXITOSO', 'FALLO'] })
  @IsOptional()
  @IsIn(['EXITOSO', 'FALLO'])
  resultado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  idUsuario?: string;
}

export class ConsultaAuditoriaDto extends IntersectionType(PaginacionDto, FiltrosAuditoriaDto) {}

export class ConsultaAccesosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ['EXITOSO', 'FALLO'] })
  @IsOptional()
  @IsIn(['EXITOSO', 'FALLO'])
  resultado?: string;
}

const JOB_EXPORTAR = 'EXPORTAR_AUDITORIA';

/** La auditoría es de solo lectura: no existen POST/PATCH/DELETE sobre la bitácora (catálogo §29). */
@ApiTags('Auditoría')
@ApiBearerAuth()
@RequirePermission('auditoria.consultar')
@Controller('auditoria')
export class AuditoriaController implements OnModuleInit {
  constructor(
    private readonly auditoriaService: AuditoriaService,
    private readonly jobs: JobsService,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  onModuleInit() {
    this.jobs.registrar(JOB_EXPORTAR, async (job) => {
      const filas = await this.auditoriaService.filasExportacion(job.parametros?.filtros || {});
      const csv = generarCsv(filas, [
        'fecha', 'usuario', 'email', 'accion', 'recurso', 'idRecurso', 'resultado', 'motivo', 'ip', 'valorAnterior', 'valorNuevo',
      ]);
      const ruta = this.almacenamiento.generarRuta('exportaciones/auditoria', '.csv');
      await this.almacenamiento.guardar(ruta, csv, 'text/csv');
      return { rutaArchivo: ruta, resumen: { registros: filas.length } };
    });
  }

  @Get()
  @ApiOperation({ summary: 'Operaciones críticas registradas en la bitácora (paginado y filtrable)' })
  async getOperacionesCriticas(@Query() filtros: ConsultaAuditoriaDto) {
    return this.auditoriaService.findAll(filtros);
  }

  @Get('anulaciones')
  @ApiOperation({ summary: 'Anulaciones, reversas y castigos' })
  async getAnulaciones(@Query() p: PaginacionDto) {
    return this.auditoriaService.findAnulaciones(p);
  }

  @Get('accesos')
  @ApiOperation({ summary: 'Accesos exitosos y fallidos (login, logout, cambios de contraseña, accesos denegados)' })
  async getAccesos(@Query() p: ConsultaAccesosDto) {
    return this.auditoriaService.findAccesos(p);
  }

  @Get('usuarios/:id')
  @ApiOperation({ summary: 'Actividad de un usuario específico' })
  async getActividadUsuario(@Param('id', ParseUUIDPipe) id: string, @Query() p: PaginacionDto) {
    return this.auditoriaService.findByUsuario(id, p);
  }

  @Post('exportar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Exportar la bitácora a CSV (asíncrono). Consulte el avance en GET /reportes/jobs/{jobId}' })
  @ApiResponse({ status: 202, description: 'Exportación encolada' })
  async exportarLog(@Body() filtros: FiltrosAuditoriaDto, @CurrentUser('id') idUsuario: string) {
    const job = await this.jobs.encolar(JOB_EXPORTAR, { filtros }, idUsuario);
    return {
      jobId: job.id_job,
      estado: job.estado,
      urlEstado: `/api/v1/reportes/jobs/${job.id_job}`,
    };
  }

  @Get(':recurso/:id')
  @ApiOperation({ summary: 'Historial de cambios de un recurso específico' })
  async getHistorialRecurso(
    @Param('recurso') recurso: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() p: PaginacionDto,
  ) {
    return this.auditoriaService.findByRecurso(recurso, id, p);
  }
}
