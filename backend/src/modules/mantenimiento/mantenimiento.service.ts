import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetricasService } from '../../common/metricas/metricas.service';
import { JobsService } from '../../common/jobs/jobs.service';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';
import { CloudSqlBackups } from './cloud-sql-backups';

const JOB_BACKUP = 'BACKUP';

@Injectable()
export class MantenimientoService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly metricas: MetricasService,
    private readonly jobs: JobsService,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly auditoria: AuditoriaService,
    private readonly backups: CloudSqlBackups,
  ) {}

  onModuleInit() {
    this.jobs.registrar(JOB_BACKUP, async (job) => {
      const resultado = await this.backups.ejecutar(
        `CRM manual ${new Date().toISOString()} (${job.parametros?.motivo || 'sin motivo'})`,
      );
      return { resumen: resultado };
    });
  }

  /** Peticiones, latencia y errores de esta instancia + estado de la base y de los jobs. */
  async getMetricas() {
    const mem = process.memoryUsage();
    const inicio = Date.now();
    const [db] = await this.dataSource.query(
      `SELECT count(*)::int AS conexiones FROM pg_stat_activity WHERE datname = current_database()`,
    );
    const latenciaDbMs = Date.now() - inicio;
    const jobs = await this.dataSource.query(
      `SELECT estado, COUNT(*)::int AS total FROM jobs_sistema GROUP BY estado`,
    );
    const [auditoria] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE resultado = 'FALLO')::int AS fallos,
              COUNT(*) FILTER (WHERE accion = 'LOGIN_FALLIDO')::int AS "loginsFallidos",
              COUNT(*) FILTER (WHERE accion = 'ACCESO_DENEGADO')::int AS "accesosDenegados"
         FROM bitacora_auditoria WHERE fecha >= now() - interval '24 hours'`,
    );

    return {
      http: this.metricas.resumen(),
      proceso: {
        uptimeSegundos: Math.floor(process.uptime()),
        memoriaMb: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsado: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
        node: process.version,
      },
      baseDeDatos: { conexionesActivas: db.conexiones, latenciaConsultaMs: latenciaDbMs },
      jobs: Object.fromEntries(jobs.map((j: any) => [j.estado, j.total])),
      seguridad24h: auditoria,
      timestamp: new Date().toISOString(),
    };
  }

  async getJobs(filtros: { tipo?: string; estado?: string; page?: number; limit?: number }) {
    const pagina = normalizarPaginacion(filtros);
    const { data, total } = await this.jobs.listar({ ...filtros, limit: pagina.limit, offset: pagina.offset });
    return paginado(data, total, pagina);
  }

  async reintentarJob(idJob: string, actor: Actor) {
    const job = await this.jobs.reintentar(idJob);
    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'REINTENTAR_JOB',
      recurso: 'jobs_sistema',
      idRecurso: idJob,
      valorNuevo: { tipo: job.tipo, estado: job.estado },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { mensaje: `Tarea ${job.tipo} en cola para reintento`, jobId: job.id_job, estado: job.estado };
  }

  /** Respaldos de Cloud SQL (automáticos y bajo demanda) y solicitudes hechas desde el CRM. */
  async getBackups() {
    const solicitudes = (await this.jobs.listar({ tipo: JOB_BACKUP, limit: 50, offset: 0 })).data;
    if (!this.backups.configurado) {
      return {
        configurado: false,
        mensaje: 'Defina GCP_PROJECT_ID y CLOUD_SQL_INSTANCE para consultar y ejecutar respaldos de Cloud SQL',
        solicitudes,
      };
    }
    return { configurado: true, instancia: this.backups.destino, respaldos: await this.backups.listar(), solicitudes };
  }

  /** Encola un respaldo bajo demanda (asíncrono, uno a la vez). */
  async ejecutarBackup(motivo: string | undefined, actor: Actor) {
    // 503 con la explicación de qué falta configurar
    this.backups.exigirConfiguracion();
    const job = await this.jobs.encolar(JOB_BACKUP, { motivo: motivo || null }, actor.id, { unico: true });
    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'EJECUTAR_BACKUP',
      recurso: 'jobs_sistema',
      idRecurso: job.id_job,
      motivo,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { jobId: job.id_job, estado: job.estado, urlEstado: `/api/v1/reportes/jobs/${job.id_job}` };
  }

  /** Uso real del almacenamiento: archivos registrados por módulo y estado del destino. */
  async getAlmacenamiento() {
    const [totales] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS archivos, COALESCE(SUM(tamano_bytes), 0)::bigint AS bytes FROM adjuntos_documento`,
    );
    const porModulo = await this.dataSource.query(
      `SELECT tabla AS modulo, COUNT(*)::int AS archivos, COALESCE(SUM(tamano_bytes), 0)::bigint AS bytes
         FROM adjuntos_documento GROUP BY tabla ORDER BY bytes DESC`,
    );
    const [exportaciones] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS archivos FROM jobs_sistema WHERE ruta_archivo IS NOT NULL`,
    );
    const bytes = Number(totales.bytes);
    return {
      destino: await this.almacenamiento.verificar(),
      adjuntos: {
        archivos: totales.archivos,
        bytes,
        megabytes: Number((bytes / 1024 / 1024).toFixed(2)),
        porModulo: porModulo.map((m: any) => ({ ...m, bytes: Number(m.bytes) })),
      },
      archivosDeExportacion: exportaciones.archivos,
    };
  }
}
