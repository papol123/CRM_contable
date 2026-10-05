import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpLoggerMiddleware, RouteParamsInterceptor } from './common/middleware/http-logger.middleware';
import { InfraestructuraModule } from './common/infraestructura.module';
import { IdempotenciaInterceptor } from './common/idempotencia/idempotencia';

// Módulos del sistema CRM Contable
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { TercerosModule } from './modules/terceros/terceros.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { FinancieroModule } from './modules/financiero/financiero.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuditoriaInterceptor } from './modules/auditoria/auditar';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module';
import { MantenimientoModule } from './modules/mantenimiento/mantenimiento.module';
import { NominaModule } from './modules/nomina/nomina.module';

// Fuera de alcance: facturación electrónica DIAN e integración con Siigo.
// Las ventas se emiten como remisiones con consecutivo interno.

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', '127.0.0.1'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'crm_contable'),
        ssl:
          configService.get<string>('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        // Cada módulo registra sus entidades con TypeOrmModule.forFeature
        autoLoadEntities: true,
        synchronize: false,
        logging: configService.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    // 429 al superar el límite por IP (GEMINI.md §6). Login y recuperación tienen límites propios.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: 60_000,
          limit: Number(config.get('THROTTLE_LIMIT') || 300),
        },
      ],
    }),
    InfraestructuraModule,
    AuditoriaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogosModule,
    TercerosModule,
    InventarioModule,
    VentasModule,
    FinancieroModule,
    ConfiguracionModule,
    MantenimientoModule,
    NominaModule,
  ],
  providers: [
    // Orden de ejecución: límite de peticiones → autenticación JWT → permisos
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // El primero envuelve a los siguientes: una repetición idempotente no vuelve a auditarse
    { provide: APP_INTERCEPTOR, useClass: RouteParamsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotenciaInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
