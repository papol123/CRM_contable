import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { rutasRegistradas, Ruta } from '../src/common/rutas/rutas-registradas';
import { api, crearApp, login } from './utils/app';

/** Reemplaza los parámetros de ruta por valores válidos de formato. */
function concretar(ruta: string): string {
  return `/api/v1${ruta}`
    .replace(':tipo', 'REMISION')
    .replace(':recurso', 'facturas_venta')
    .replace(/:[A-Za-z]+/g, () => randomUUID());
}

function llamar(app: NestExpressApplication, r: Ruta, token?: string) {
  const metodo = r.http.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const req = api(app)[metodo](concretar(r.ruta));
  if (token) req.set('Authorization', `Bearer ${token}`);
  return metodo === 'get' || metodo === 'delete' ? req : req.send({});
}

describe('Autorización (catálogo §34)', () => {
  let app: NestExpressApplication;
  let usuario: { token: string; permisos: string[] };
  let admin: { token: string; permisos: string[] };
  const rutas = rutasRegistradas(AppModule);

  beforeAll(async () => {
    app = await crearApp();
    usuario = await login(app, 'usuario@crmcontable.com');
    admin = await login(app, 'admin@crmcontable.com');
  });

  afterAll(async () => app.close());

  it('sin token → 401 en toda ruta no pública, con application/problem+json', async () => {
    const fallas: string[] = [];
    for (const r of rutas.filter((x) => !x.publico)) {
      const res = await llamar(app, r);
      if (res.status !== 401 || !res.headers['content-type']?.includes('application/problem+json')) {
        fallas.push(`${r.http} ${r.ruta} → ${res.status}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('token de Usuario → 403 en toda ruta que exige un permiso que el Usuario no tiene', async () => {
    const administrativas = rutas.filter(
      (r) => !r.publico && r.permisos.length > 0 && !r.permisos.every((p) => usuario.permisos.includes(p)),
    );
    expect(administrativas.length).toBeGreaterThan(60);

    const fallas: string[] = [];
    for (const r of administrativas) {
      const res = await llamar(app, r, usuario.token);
      if (res.status !== 403) fallas.push(`${r.http} ${r.ruta} → ${res.status}`);
    }
    expect(fallas).toEqual([]);
  });

  it('el Usuario conserva la operación diaria (no recibe 403)', async () => {
    const operativas = rutas.filter(
      (r) => !r.publico && r.permisos.length > 0 && r.permisos.every((p) => usuario.permisos.includes(p)),
    );
    const rutasOperativas = operativas.map((r) => `${r.http} ${r.ruta}`);
    for (const esperada of [
      'POST /facturas-venta',
      'POST /cotizaciones',
      'POST /pedidos',
      'POST /facturas-compra',
      'POST /pagos',
      'POST /gastos',
      'POST /inventario/entradas',
      'POST /inventario/salidas',
      'POST /inventario/traslados',
      'POST /productos',
      'GET /cartera/resumen',
    ]) {
      expect(rutasOperativas).toContain(esperada);
    }
    for (const r of operativas) {
      const res = await llamar(app, r, usuario.token);
      expect({ ruta: `${r.http} ${r.ruta}`, status: res.status }).not.toEqual({ ruta: `${r.http} ${r.ruta}`, status: 403 });
    }
  });

  it('ningún GET sin parámetros responde 5xx al Administrador', async () => {
    const fallas: string[] = [];
    for (const r of rutas.filter((x) => x.http === 'GET' && !x.ruta.includes(':') && !x.publico)) {
      const res = await llamar(app, r, admin.token);
      if (res.status >= 500) fallas.push(`${r.http} ${r.ruta} → ${res.status} ${res.body?.detail ?? ''}`);
    }
    expect(fallas).toEqual([]);
  });

  it('un rol desactivado deja al usuario sin permisos en la siguiente solicitud', async () => {
    const roles = (await api(app).get('/api/v1/roles').set('Authorization', `Bearer ${admin.token}`)).body;
    const rolUsuario = roles.find((r: any) => r.codigo === 'USUARIO');
    const vendedor = await login(app, 'vendedor@crmcontable.com');

    await api(app).patch(`/api/v1/roles/${rolUsuario.id}`).set('Authorization', `Bearer ${admin.token}`).send({ activo: false }).expect(200);
    try {
      await api(app).get('/api/v1/clientes').set('Authorization', `Bearer ${vendedor.token}`).expect(403);
    } finally {
      await api(app).patch(`/api/v1/roles/${rolUsuario.id}`).set('Authorization', `Bearer ${admin.token}`).send({ activo: true }).expect(200);
    }
    await api(app).get('/api/v1/clientes').set('Authorization', `Bearer ${vendedor.token}`).expect(200);
  });
});
