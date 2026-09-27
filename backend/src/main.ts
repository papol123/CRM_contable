import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Prefijo global de versión de API
  app.setGlobalPrefix('api/v1');

  // 2. Parser de Cookies para Refresh Tokens HttpOnly
  app.use(cookieParser());

  // 3. Habilitación de CORS para el Frontend (Next.js)
  // En producción solo se acepta FRONTEND_URL (puede ser una lista separada por comas).
  // En desarrollo se aceptan además localhost y 127.0.0.1 en cualquier puerto.
  const esProduccion = process.env.NODE_ENV === 'production';
  const origenesPermitidos = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Solicitudes sin origin (curl, Bruno, servidor a servidor) no están sujetas a CORS
      if (!origin) return callback(null, true);
      const esLocal =
        origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
      const permitido = origenesPermitidos.includes(origin) || (!esProduccion && esLocal);
      // Con false no se envían cabeceras CORS y el navegador bloquea la respuesta
      callback(null, permitido);
    },
    credentials: true,
  });

  // 4. Validación global de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 5. Filtro global de excepciones HTTP para respuestas estandarizadas
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // 6. Documentación interactiva Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('CRM Contable — Repuestos Automotrices API')
    .setDescription(
      'Catálogo completo de servicios REST para CRM/ERP Contable: Autenticación RBAC, Usuarios, Catálogos, Terceros (Clientes y Proveedores), Productos e Inventario (Kardex), Ventas y Facturación DIAN, Compras, Pagos y Cartera.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Servidor ejecutándose en: http://localhost:${port}/api/v1`);
  logger.log(`📖 Documentación Swagger disponible en: http://localhost:${port}/api/docs`);
}

bootstrap();
