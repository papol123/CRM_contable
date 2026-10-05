import { rmSync } from 'fs';

export default async function globalTeardown() {
  const estado = (globalThis as any).__CRM_E2E__;
  if (!estado) return;
  await estado.pg.stop();
  rmSync(estado.directorio, { recursive: true, force: true });
}
