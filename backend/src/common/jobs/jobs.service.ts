import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AlmacenamientoService } from '../almacenamiento/almacenamiento.service';

export interface Job {
  id_job: string;
  tipo: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO' | 'FALLIDO';
  progreso: number;
  parametros: Record<string, any> | null;
  id_usuario: string | null;
  intentos: number;
  ruta_archivo: string | null;
  resultado_url: string | null;
  error: string | null;
  creado_en: Date;
  iniciado_en: Date | null;
  actualizado_en: Date;
}

export interface ResultadoJob {
  /** Archivo generado (export, PDF) ya guardado en almacenamiento */
  rutaArchivo?: string;
  /** Resumen legible del resultado (destinatarios, conteos...) */
  resumen?: Record<string, any>;
}

export type ManejadorJob = (job: Job) => Promise<ResultadoJob | void>;

/** Usuario autenticado tal como lo entrega JwtStrategy */
interface UsuarioJob {
  id: string;
  permisos: string[];
}

const PERMISO_VER_TODOS = 'mantenimiento.gestionar';
const MAX_INTENTOS = 3;
const MINUTOS_JOB_COLGADO = 15;

/**
 * Cola de tareas asíncronas sobre la tabla jobs_sistema (catálogo §33.14).
 *
 * Un worker en el mismo proceso toma los jobs PENDIENTE con
 * `FOR UPDATE SKIP LOCKED`, así varias instancias de Cloud Run no ejecutan el
 * mismo job dos veces. Para que el worker corra sin tráfico, despliegue con
 * CPU siempre asignada (--no-cpu-throttling) o al menos una instancia mínima.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly manejadores = new Map<string, ManejadorJob>();
  private temporizador?: NodeJS.Timeout;
  private procesando = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  registrar(tipo: string, manejador: ManejadorJob) {
    this.manejadores.set(tipo, manejador);
  }

  onApplicationBootstrap() {
    if (this.config.get('JOBS_WORKER') === 'false') return;
    const intervalo = Number(this.config.get('JOBS_INTERVALO_MS') || 3000);
    this.temporizador = setInterval(() => void this.procesarPendientes(), intervalo);
    this.temporizador.unref();
  }

  onApplicationShutdown() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /**
   * Encola un job. Con `unico`, rechaza la solicitud si ya hay uno del mismo
   * tipo pendiente o en proceso (evita ejecuciones duplicadas simultáneas).
   */
  async encolar(
    tipo: string,
    parametros: Record<string, any>,
    idUsuario: string | null,
    opciones: { unico?: boolean } = {},
  ): Promise<Job> {
    return this.dataSource.transaction(async (manager) => {
      if (opciones.unico) {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`job:${tipo}`]);
        const [activo] = await manager.query(
          `SELECT id_job FROM jobs_sistema WHERE tipo = $1 AND estado IN ('PENDIENTE', 'EN_PROCESO') LIMIT 1`,
          [tipo],
        );
        if (activo) {
          throw new ConflictException({
            message: `Ya hay una tarea ${tipo} en curso (${activo.id_job}). Espere a que termine`,
            tipo: 'job-duplicado',
          });
        }
      }
      const [job] = await manager.query(
        `INSERT INTO jobs_sistema (tipo, estado, progreso, parametros, id_usuario)
         VALUES ($1, 'PENDIENTE', 0, $2, $3)
         RETURNING *`,
        [tipo, JSON.stringify(parametros ?? {}), idUsuario],
      );
      return job;
    });
  }

  /** Procesa todos los jobs pendientes. Lo llama el worker periódico (y las pruebas). */
  async procesarPendientes(): Promise<number> {
    if (this.procesando) return 0;
    this.procesando = true;
    let procesados = 0;
    try {
      await this.recuperarColgados();
      for (;;) {
        const job = await this.tomarSiguiente();
        if (!job) break;
        await this.ejecutar(job);
        procesados++;
      }
    } catch (err: any) {
      this.logger.error(`Error en el worker de jobs: ${err.message}`);
    } finally {
      this.procesando = false;
    }
    return procesados;
  }

  private async tomarSiguiente(): Promise<Job | null> {
    const [job] = await this.dataSource.query(
      `UPDATE jobs_sistema
          SET estado = 'EN_PROCESO', iniciado_en = now(), intentos = intentos + 1,
              progreso = 0, error = NULL, actualizado_en = now()
        WHERE id_job = (
          SELECT id_job FROM jobs_sistema
           WHERE estado = 'PENDIENTE'
           ORDER BY creado_en
           FOR UPDATE SKIP LOCKED
           LIMIT 1)
       RETURNING *`,
    );
    return Array.isArray(job) ? job[0] ?? null : job ?? null;
  }

  private async ejecutar(job: Job) {
    const manejador = this.manejadores.get(job.tipo);
    if (!manejador) {
      await this.finalizar(job.id_job, 'FALLIDO', { error: `No hay manejador para tareas ${job.tipo}` });
      return;
    }
    try {
      const resultado = (await manejador(job)) || {};
      await this.finalizar(job.id_job, 'COMPLETADO', {
        rutaArchivo: resultado.rutaArchivo,
        resumen: resultado.resumen,
      });
    } catch (err: any) {
      this.logger.warn(`Job ${job.tipo} ${job.id_job} falló: ${err.message}`);
      await this.finalizar(job.id_job, 'FALLIDO', { error: String(err.message || err).slice(0, 1000) });
    }
  }

  private async finalizar(
    id: string,
    estado: 'COMPLETADO' | 'FALLIDO',
    datos: { rutaArchivo?: string; resumen?: Record<string, any>; error?: string },
  ) {
    await this.dataSource.query(
      `UPDATE jobs_sistema
          SET estado = $2::varchar,
              progreso = CASE WHEN $2::varchar = 'COMPLETADO' THEN 100 ELSE progreso END,
              ruta_archivo = COALESCE($3::text, ruta_archivo),
              parametros = CASE WHEN $4::jsonb IS NULL THEN parametros
                                ELSE COALESCE(parametros, '{}'::jsonb) || jsonb_build_object('resultado', $4::jsonb) END,
              error = $5::text,
              actualizado_en = now()
        WHERE id_job = $1`,
      [id, estado, datos.rutaArchivo ?? null, datos.resumen ? JSON.stringify(datos.resumen) : null, datos.error ?? null],
    );
  }

  /** Un job EN_PROCESO por más de 15 min quedó huérfano (la instancia se detuvo). */
  private async recuperarColgados() {
    await this.dataSource.query(
      `UPDATE jobs_sistema
          SET estado = CASE WHEN intentos < $1 THEN 'PENDIENTE' ELSE 'FALLIDO' END,
              error = CASE WHEN intentos < $1 THEN error ELSE 'La tarea se interrumpió demasiadas veces' END,
              actualizado_en = now()
        WHERE estado = 'EN_PROCESO' AND iniciado_en < now() - make_interval(mins => $2)`,
      [MAX_INTENTOS, MINUTOS_JOB_COLGADO],
    );
  }

  async reintentar(id: string): Promise<Job> {
    const [filas] = await this.dataSource.query(
      `UPDATE jobs_sistema
          SET estado = 'PENDIENTE', progreso = 0, error = NULL, actualizado_en = now()
        WHERE id_job = $1 AND estado = 'FALLIDO'
       RETURNING *`,
      [id],
    );
    const job = Array.isArray(filas) ? filas[0] : filas;
    if (job) return job;

    const [existe] = await this.dataSource.query(`SELECT estado FROM jobs_sistema WHERE id_job = $1`, [id]);
    if (!existe) throw new NotFoundException(`Tarea ${id} no encontrada`);
    throw new ConflictException(`Solo se reintentan tareas FALLIDAS; esta está ${existe.estado}`);
  }

  /** Un usuario sin mantenimiento.gestionar solo ve sus propios jobs (404 para los ajenos). */
  async obtener(id: string, usuario?: UsuarioJob): Promise<Job> {
    const [job] = await this.dataSource.query(`SELECT * FROM jobs_sistema WHERE id_job = $1`, [id]);
    if (!job || (usuario && !usuario.permisos?.includes(PERMISO_VER_TODOS) && job.id_usuario !== usuario.id)) {
      throw new NotFoundException(`Tarea ${id} no encontrada`);
    }
    return job;
  }

  async listar(filtros: { tipo?: string; estado?: string; limit: number; offset: number }) {
    const condiciones: string[] = [];
    const params: any[] = [];
    if (filtros.tipo) {
      params.push(filtros.tipo);
      condiciones.push(`tipo = $${params.length}`);
    }
    if (filtros.estado) {
      params.push(filtros.estado);
      condiciones.push(`estado = $${params.length}`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM jobs_sistema ${where}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT id_job, tipo, estado, progreso, error, parametros, id_usuario, intentos,
              ruta_archivo IS NOT NULL AS tiene_archivo, creado_en, iniciado_en, actualizado_en
         FROM jobs_sistema ${where}
        ORDER BY creado_en DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filtros.limit, filtros.offset],
    );
    return { data, total };
  }

  /** Vista pública del job con el enlace de descarga cuando hay archivo. */
  async vista(job: Job, rutaDescarga: string) {
    let urlDescarga: string | null = null;
    if (job.estado === 'COMPLETADO' && job.ruta_archivo) {
      urlDescarga = (await this.almacenamiento.urlFirmada(job.ruta_archivo)) || rutaDescarga;
    }
    return {
      jobId: job.id_job,
      tipo: job.tipo,
      estado: job.estado,
      progreso: job.progreso,
      error: job.error,
      resultado: job.parametros?.resultado ?? null,
      intentos: job.intentos,
      creadoEn: job.creado_en,
      actualizadoEn: job.actualizado_en,
      urlDescarga,
    };
  }
}
