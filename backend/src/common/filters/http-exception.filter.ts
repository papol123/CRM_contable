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

/** Errores de PostgreSQL que son culpa de los datos enviados, no del servidor. */
const ERRORES_POSTGRES: Record<string, { status: number; error: string; mensaje: string }> = {
  '23505': { status: HttpStatus.CONFLICT, error: 'Conflict', mensaje: 'Ya existe un registro con esos datos' },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    error: 'Bad Request',
    mensaje: 'Uno de los identificadores enviados no existe o el registro está en uso',
  },
  '23514': { status: HttpStatus.BAD_REQUEST, error: 'Bad Request', mensaje: 'Un valor no cumple las reglas de la base de datos' },
  '23502': { status: HttpStatus.BAD_REQUEST, error: 'Bad Request', mensaje: 'Falta un campo obligatorio' },
  '22P02': { status: HttpStatus.BAD_REQUEST, error: 'Bad Request', mensaje: 'Formato de dato inválido' },
  '22001': { status: HttpStatus.BAD_REQUEST, error: 'Bad Request', mensaje: 'Un texto supera la longitud permitida' },
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      // Nombre estándar del estado (p. ej. "Unauthorized") si la excepción no trae uno propio
      error = HttpStatus[status]
        ? HttpStatus[status]
            .toLowerCase()
            .split('_')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ')
        : error;
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || message;
        error = resObj.error || error;
      }

      // Reglas específicas del proyecto
      if (status === HttpStatus.NOT_FOUND) {
        if (typeof message === 'string' && message.startsWith('Cannot ')) {
          message = 'La ruta no existe todavía o su prefijo no es /api/v1';
        }
      } else if (status === HttpStatus.UNAUTHORIZED) {
        if (!message || message === 'Unauthorized' || message === 'Credenciales inválidas') {
          // El login explica sus propios errores; en el resto de rutas falta o venció el token
          message = request.url.includes('/auth/login')
            ? 'Email o contraseña incorrectos, o ese usuario no existe en la base'
            : 'Token ausente, inválido o vencido. Inicie sesión y envíe el token en el header Authorization (Bearer)';
        }
      }
    } else if (exception instanceof QueryFailedError && ERRORES_POSTGRES[(exception as any).code]) {
      const pg = exception as QueryFailedError & { code: string; detail?: string };
      const mapeo = ERRORES_POSTGRES[pg.code];
      status = mapeo.status;
      error = mapeo.error;
      message = pg.detail ? `${mapeo.mensaje}: ${pg.detail}` : mapeo.mensaje;
    } else {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // En producción no se exponen detalles internos (SQL, rutas, etc.)
      if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
        message = exception.message;
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      error,
    });
  }
}
