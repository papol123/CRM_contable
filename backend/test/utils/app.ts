import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configurarAplicacion } from '../../src/app.setup';
import { JobsService } from '../../src/common/jobs/jobs.service';

export const CLAVE_SEMILLA = 'Admin123*';

export async function crearApp() {
  // Protección: las pruebas E2E jamás deben conectarse a Cloud SQL
  if (process.env.DB_HOST !== '127.0.0.1' || process.env.NODE_ENV !== 'test') {
    throw new Error('Las pruebas E2E solo corren contra el PostgreSQL embebido (DB_HOST=127.0.0.1, NODE_ENV=test)');
  }
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configurarAplicacion(modulo.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return app;
}

export function api(app: NestExpressApplication) {
  return request(app.getHttpServer());
}

export async function login(app: NestExpressApplication, email: string, password = CLAVE_SEMILLA) {
  const res = await api(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, permisos: res.body.user.permisos as string[] };
}

/** Ejecuta los jobs pendientes (el worker periódico está apagado en las pruebas). */
export async function procesarJobs(app: NestExpressApplication) {
  return app.get(JobsService).procesarPendientes();
}
