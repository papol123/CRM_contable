import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarAplicacion } from './app.setup';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = configurarAplicacion(await NestFactory.create<NestExpressApplication>(AppModule));

  // Documentación interactiva Swagger / OpenAPI (SWAGGER=false la desactiva)
  if (process.env.SWAGGER !== 'false') {
    const config = new DocumentBuilder()
      .setTitle('CRM Contable — Repuestos Automotrices API')
      .setDescription(
        'Servicios REST del CRM/ERP contable de repuestos automotrices: autenticación y permisos granulares, usuarios, catálogos, ' +
          'clientes y proveedores, productos e inventario (kardex), cotizaciones, pedidos, ventas por remisión, compras, pagos, ' +
          'cartera, gastos, reportes, nómina, auditoría y operación. Los errores siguen RFC 9457 (application/problem+json). ' +
          'Las operaciones de creación de remisiones, compras y pagos aceptan la cabecera Idempotency-Key.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Servidor ejecutándose en: http://localhost:${port}/api/v1`);
  if (process.env.SWAGGER !== 'false') {
    logger.log(`📖 Documentación Swagger disponible en: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
