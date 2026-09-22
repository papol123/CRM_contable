import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Prefijo global de versión de API
  app.setGlobalPrefix('api/v1');

  // 2. Parser de Cookies para Refresh Tokens HttpOnly
  app.use(cookieParser());

  // 3. Habilitación de CORS para el Frontend (Next.js)
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
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

  // 5. Documentación interactiva Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('CRM Contable API')
    .setDescription(
      'API REST para CRM Contable de Repuestos Automotrices - Módulo de Autenticación y Autorización RBAC',
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
