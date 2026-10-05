import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Configuración HTTP común a main.ts y a las pruebas E2E: así las pruebas
 * ejercitan exactamente el mismo prefijo, validación, CORS y formato de errores.
 */
export function configurarAplicacion(app: NestExpressApplication) {
  // Cloud Run agrega un salto de proxy (X-Forwarded-For): con 1 salto req.ip es la IP
  // real del cliente sin aceptar cabeceras falsificadas (límite de peticiones y auditoría)
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.enableShutdownHooks();

  app.setGlobalPrefix('api/v1');

  // Refresh token en cookie HttpOnly
  app.use(cookieParser());

  // CORS: en producción solo FRONTEND_URL (lista separada por comas);
  // en desarrollo también localhost y 127.0.0.1 en cualquier puerto
  const esProduccion = process.env.NODE_ENV === 'production';
  const origenesPermitidos = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Solicitudes sin origin (curl, servidor a servidor) no están sujetas a CORS
      if (!origin) return callback(null, true);
      const esLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
      callback(null, origenesPermitidos.includes(origin) || (!esProduccion && esLocal));
    },
    credentials: true,
  });

  // Validación de DTOs: rechaza campos no declarados
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Errores en formato RFC 9457 (application/problem+json)
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  return app;
}
