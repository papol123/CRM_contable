import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
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
        // Si es ruta inexistente
        if (typeof message === 'string' && message.startsWith('Cannot ')) {
          message = 'La ruta no existe todavía o su prefijo no es /api/v1';
        }
      } else if (status === HttpStatus.UNAUTHORIZED) {
        if (!message || message === 'Unauthorized' || message === 'Credenciales inválidas') {
          message = 'Email o contraseña incorrectos, o ese usuario no existe en la base';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
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
