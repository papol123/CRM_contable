import { execFileSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
// El paquete publica sus tipos solo para resolución node16; se carga con require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmbeddedPostgres = require('embedded-postgres').default;

/**
 * Levanta un PostgreSQL 17 embebido y desechable, aplica esquema, migraciones
 * y datos semilla (incluido el demo de 6 meses). Las pruebas E2E nunca tocan
 * Cloud SQL.
 */
export default async function globalSetup() {
  const puerto = Number(process.env.E2E_PG_PORT || 54330);
  const directorio = mkdtempSync(path.join(tmpdir(), 'crm-e2e-pg-'));

  const pg = new EmbeddedPostgres({
    databaseDir: directorio,
    user: 'postgres',
    password: 'postgres',
    port: puerto,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('crm_contable');

  const entorno = {
    DB_HOST: '127.0.0.1',
    DB_PORT: String(puerto),
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'crm_contable',
    DB_SSL: 'false',
    NODE_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'secreto-solo-para-pruebas-e2e',
    JWT_EXPIRATION: '15m',
    CORREO_MODO: 'log',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: path.join(directorio, 'uploads'),
    JOBS_WORKER: 'false',
    THROTTLE_LIMIT: '100000',
    GCP_PROJECT_ID: '',
    CLOUD_SQL_INSTANCE: '',
  };
  Object.assign(process.env, entorno);

  const raiz = path.join(__dirname, '..', '..');
  for (const script of ['migrate.js', 'seed-database.js', 'seed-demo.js']) {
    execFileSync(process.execPath, [path.join(raiz, 'scripts', script)], {
      cwd: raiz,
      env: { ...process.env, ...entorno },
      stdio: 'pipe',
    });
  }

  (globalThis as any).__CRM_E2E__ = { pg, directorio };
}
