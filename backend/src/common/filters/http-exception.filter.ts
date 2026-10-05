import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Respuestas de error en formato RFC 9457 (application/problem+json), GEMINI.md §6.
 *
 *   { type, title, status, detail, instance, errors? }
 *
 * `type` es una URI estable por clase de error. Un servicio puede fijarla
 * lanzando la excepción con un objeto `{ message, tipo: 'stock-insuficiente' }`.
 */

export const TIPO_PROBLEMA_BASE = (
  process.env.API_ERRORS_BASE_URL || 'https://api.tudominio.com/errors'
).replace(/\/$/, '');

const TITULOS: Record<number, { tipo: string; titulo: string }> = {
  400: { tipo: 'solicitud-invalida', titulo: 'Solicitud inválida' },
  401: { tipo: 'no-autenticado', titulo: 'No autenticado' },
  403: { tipo: 'sin-permiso', titulo: 'Permiso denegado' },
  404: { tipo: 'no-encontrado', titulo: 'Recurso no encontrado' },
  405: { tipo: 'metodo-no-permitido', titulo: 'Método no permitido' },
  409: { tipo: 'conflicto', titulo: 'Conflicto con el estado actual' },
  413: { tipo: 'archivo-muy-grande', titulo: 'Contenido demasiado grande' },
  415: { tipo: 'tipo-no-soportado', titulo: 'Tipo de contenido no soportado' },
  422: { tipo: 'regla-de-negocio', titulo: 'Regla de negocio incumplida' },
  429: { tipo: 'demasiadas-solicitudes', titulo: 'Demasiadas solicitudes' },
  500: { tipo: 'error-interno', titulo: 'Error interno del servidor' },
  501: { tipo: 'no-implementado', titulo: 'No implementado' },
  503: { tipo: 'dependencia-no-disponible', titulo: 'Servicio no disponible' },
};

/** Errores de PostgreSQL que son culpa de los datos enviados, no del servidor. */
const ERRORES_POSTGRES: Record<string, { status: number; tipo: string; mensaje: string }> = {
  '23505': { status: HttpStatus.CONFLICT, tipo: 'duplicado', mensaje: 'Ya existe un registro con esos datos' },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    tipo: 'referencia-invalida',
    mensaje: 'Uno de los identificadores enviados no existe o el registro está en uso',
  },
  '23514': { status: HttpStatus.UNPROCESSABLE_ENTITY, tipo: 'regla-de-negocio', mensaje: 'Un valor no cumple las reglas de la base de datos' },
  '23502': { status: HttpStatus.BAD_REQUEST, tipo: 'solicitud-invalida', mensaje: 'Falta un campo obligatorio' },
  '22P02': { status: HttpStatus.BAD_REQUEST, tipo: 'solicitud-invalida', mensaje: 'Formato de dato inválido' },
  '22001': { status: HttpStatus.BAD_REQUEST, tipo: 'solicitud-invalida', mensaje: 'Un texto supera la longitud permitida' },
  '22003': { status: HttpStatus.UNPROCESSABLE_ENTITY, tipo: 'regla-de-negocio', mensaje: 'Un valor numérico supera el rango permitido' },
};

/** Códigos de red y de PostgreSQL que indican que la base de datos no está disponible. */
const CODIGOS_DEPENDENCIA_CAIDA = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08001',
  '08003',
  '08006',
  '53300', // too_many_connections
]);

export interface Problema {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: string[];
}

function esDependenciaCaida(exception: unknown): boolean {
  const err = exception as { code?: string; message?: string };
  if (err?.code && CODIGOS_DEPENDENCIA_CAIDA.has(err.code)) return true;
  const mensaje = String(err?.message || '');
  return /Connection terminated|connect ECONNREFUSED|timeout exceeded when trying to connect/i.test(mensaje);
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const problema = this.construir(exception, request);

    if (problema.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${problema.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (response.headersSent) return;
    response.status(problema.status).type('application/problem+json').send(JSON.stringify(problema));
  }

  construir(exception: unknown, request: Pick<Request, 'originalUrl' | 'url'>): Problema {
    const instance = request.originalUrl || request.url;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let detail = 'Error interno del servidor';
    let tipo: string | undefined;
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        detail = res;
      } else if (res && typeof res === 'object') {
        const obj = res as Record<string, any>;
        if (Array.isArray(obj.message)) {
          // ValidationPipe: lista de errores por campo
          errors = obj.message.map(String);
          detail = 'La solicitud tiene datos inválidos';
        } else if (obj.message) {
          detail = String(obj.message);
        }
        if (typeof obj.tipo === 'string') tipo = obj.tipo;
      }

      if (status === HttpStatus.NOT_FOUND && detail.startsWith('Cannot ')) {
        detail = 'La ruta no existe o su prefijo no es /api/v1';
      } else if (status === HttpStatus.UNAUTHORIZED && (!detail || detail === 'Unauthorized')) {
        detail = 'Token ausente, inválido o vencido. Inicie sesión y envíe el token en el header Authorization (Bearer)';
      } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
        detail = 'Superó el límite de solicitudes permitidas. Intente de nuevo en unos segundos';
      }
    } else if (esDependenciaCaida(exception)) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      detail = 'La base de datos no está disponible en este momento. Intente de nuevo más tarde';
    } else if (exception instanceof QueryFailedError && ERRORES_POSTGRES[(exception as any).code]) {
      const pg = exception as QueryFailedError & { code: string; detail?: string };
      const mapeo = ERRORES_POSTGRES[pg.code];
      status = mapeo.status;
      tipo = mapeo.tipo;
      detail = pg.detail ? `${mapeo.mensaje}: ${pg.detail}` : mapeo.mensaje;
    } else if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      // En producción no se exponen detalles internos (SQL, rutas, etc.)
      detail = exception.message;
    }

    const base = TITULOS[status] || {
      tipo: status >= 500 ? 'error-interno' : 'solicitud-invalida',
      titulo: HttpStatus[status] ? String(HttpStatus[status]).replace(/_/g, ' ') : 'Error',
    };

    const problema: Problema = {
      type: `${TIPO_PROBLEMA_BASE}/${tipo || base.tipo}`,
      title: base.titulo,
      status,
      detail,
      instance,
    };
    if (errors) problema.errors = errors;
    return problema;
  }
}
