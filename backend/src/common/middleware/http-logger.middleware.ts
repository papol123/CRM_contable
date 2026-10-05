import {
  Injectable,
  NestMiddleware,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Observable } from 'rxjs';
import { MetricasService } from '../metricas/metricas.service';

/**
 * Patrones de campos sensibles que no deben exponerse en los logs de desarrollo
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /contrase[nñ]a/i,
  /clave/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /credencial/i,
  /credential/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /cvv/i,
  /cvc/i,
  /credit[-_]?card/i,
  /tarjeta/i,
  /pin/i,
];

/**
 * Verifica si el nombre de una propiedad corresponde a un dato sensible
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitiza recursivamente objetos, arrays y valores para no filtrar credenciales en consola
 */
export function sanitizeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return '[Buffer / Binario]';
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '*** [PROTEGIDO] ***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Interceptor para capturar los parámetros de ruta (`req.params`) en el momento
 * de resolución del controlador en NestJS.
 */
@Injectable()
export class RouteParamsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (req && req.params) {
      req._routeParams = { ...req.params };
    }
    return next.handle();
  }
}

/**
 * Middleware para auditar y registrar en consola cada solicitud HTTP recibida.
 * Muestra Método, URL/Endpoint, Código de respuesta, Parámetros recibidos (ruta y query),
 * Body (cuando corresponda) y tiempo de respuesta en ms.
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  // En producción el body no se escribe en los logs (datos personales y comerciales)
  private readonly registrarBody = process.env.NODE_ENV !== 'production';

  constructor(private readonly metricas: MetricasService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, originalUrl, url } = req;
    const requestUrl = originalUrl || url;

    // Omitir archivos estáticos de Swagger UI o favicon para no saturar la consola
    if (
      requestUrl.endsWith('.css') ||
      requestUrl.endsWith('.js') ||
      requestUrl.endsWith('.png') ||
      requestUrl.endsWith('.ico') ||
      requestUrl.endsWith('.map')
    ) {
      return next();
    }

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      // Se agrupa por la plantilla de la ruta (/clientes/:id) para no crear una métrica por id
      const plantilla = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : 'sin-ruta';
      this.metricas.registrar(method, plantilla, statusCode, duration);

      // Parámetros de ruta y query
      const routeParams = (req as any)._routeParams || req.params || {};
      const queryParams = req.query || {};
      const body = req.body;

      const hasRouteParams = Object.keys(routeParams).length > 0;
      const hasQueryParams = Object.keys(queryParams).length > 0;
      const hasBody =
        body &&
        typeof body === 'object' &&
        Object.keys(body).length > 0;

      const lines: string[] = [
        `[${method}] ${requestUrl} -> ${statusCode} (${duration}ms)`,
      ];

      // Parámetros recibidos (Ruta y Query)
      if (hasRouteParams) {
        lines.push(`   └─ Parámetros de ruta: ${JSON.stringify(sanitizeData(routeParams))}`);
      }
      if (hasQueryParams) {
        lines.push(`   └─ Query params: ${JSON.stringify(sanitizeData(queryParams))}`);
      }
      if (!hasRouteParams && !hasQueryParams) {
        lines.push(`   └─ Parámetros: {}`);
      }

      // Body recibido
      if (hasBody && this.registrarBody) {
        lines.push(`   └─ Body: ${JSON.stringify(sanitizeData(body))}`);
      }

      const logOutput = lines.join('\n');

      if (statusCode >= 500) {
        this.logger.error(logOutput);
      } else if (statusCode >= 400) {
        this.logger.warn(logOutput);
      } else {
        this.logger.log(logOutput);
      }
    });

    next();
  }
}
