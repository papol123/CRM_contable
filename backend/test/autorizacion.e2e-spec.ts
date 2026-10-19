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
    // Estas dos exigen filtrar por tercero sin el permiso global: se prueban aparte
    const conFiltroObligatorio = ['GET /cuentas-por-cobrar', 'GET /cuentas-por-pagar'];
    const operativas = rutas.filter(
      (r) =>
        !r.publico &&
        r.permisos.length > 0 &&
        r.permisos.every((p) => usuario.permisos.includes(p)) &&
        !conFiltroObligatorio.includes(`${r.http} ${r.ruta}`),
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
      'GET /clientes/buscar',
      'GET /proveedores/buscar',
      'GET /clientes/:id/cartera',
    ]) {
      expect(rutasOperativas).toContain(esperada);
    }
    for (const r of operativas) {
      const res = await llamar(app, r, usuario.token);
      expect({ ruta: `${r.http} ${r.ruta}`, status: res.status }).not.toEqual({ ruta: `${r.http} ${r.ruta}`, status: 403 });
    }
  });

  it('el Usuario no ve el directorio de terceros ni la información global (solo Administrador)', async () => {
    for (const ruta of [
      '/usuarios',
      '/roles',
      '/auditoria',
      '/configuracion',
      '/clientes',
      `/clientes/${randomUUID()}`,
      `/clientes/${randomUUID()}/telefonos`,
      `/clientes/${randomUUID()}/correos`,
      '/proveedores',
      `/proveedores/${randomUUID()}`,
      '/cartera/morosos',
      '/cartera/vencida',
      '/cartera/resumen',
      '/cuentas-por-cobrar',
      '/cuentas-por-pagar',
      '/cuentas-por-pagar/vencidas',
      '/dashboard/resumen',
      '/reportes/ventas',
      '/reportes/cartera',
    ]) {
      const res = await api(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${usuario.token}`);
      expect({ ruta, status: res.status }).toEqual({ ruta, status: 403 });
    }
    for (const ruta of ['/clientes', '/proveedores', '/cartera/resumen', '/cuentas-por-cobrar', '/dashboard/resumen']) {
      const res = await api(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${admin.token}`);
      expect({ ruta, status: res.status }).toEqual({ ruta, status: 200 });
    }
  });

  it('la búsqueda de clientes no expone contacto ni cupo', async () => {
    const res = await api(app).get('/api/v1/clientes/buscar?q=a').set('Authorization', `Bearer ${usuario.token}`).expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const { body } = await api(app).get('/api/v1/clientes/buscar?q=ta').set('Authorization', `Bearer ${usuario.token}`).expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(20);
    for (const c of body) {
      expect(Object.keys(c).sort()).toEqual(['activo', 'creditoBloqueado', 'id', 'numeroDocumento', 'razonSocial']);
    }
    // Un comodín LIKE no recorre todo el directorio
    const comodin = await api(app).get('/api/v1/clientes/buscar?q=%25%25').set('Authorization', `Bearer ${usuario.token}`).expect(200);
    expect(comodin.body).toEqual([]);
  });

  it('cuentas por cobrar y por pagar: el Usuario debe filtrar por tercero', async () => {
    const [cliente] = (await api(app).get('/api/v1/clientes/buscar?q=ta').set('Authorization', `Bearer ${usuario.token}`)).body;
    await api(app).get(`/api/v1/cuentas-por-cobrar?clienteId=${cliente.id}`).set('Authorization', `Bearer ${usuario.token}`).expect(200);
    await api(app).get('/api/v1/cuentas-por-cobrar').set('Authorization', `Bearer ${usuario.token}`).expect(403);
    await api(app).get(`/api/v1/cuentas-por-pagar?proveedorId=${randomUUID()}`).set('Authorization', `Bearer ${usuario.token}`).expect(200);
    await api(app).get('/api/v1/cuentas-por-pagar').set('Authorization', `Bearer ${usuario.token}`).expect(403);
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
    const rolVendedor = roles.find((r: any) => r.codigo === 'VENDEDOR') || roles.find((r: any) => r.codigo === 'USUARIO');
    const vendedor = await login(app, 'vendedor@crmcontable.com');

    await api(app).patch(`/api/v1/roles/${rolVendedor.id}`).set('Authorization', `Bearer ${admin.token}`).send({ activo: false }).expect(200);
    try {
      await api(app).get('/api/v1/clientes/buscar?q=ta').set('Authorization', `Bearer ${vendedor.token}`).expect(403);
    } finally {
      await api(app).patch(`/api/v1/roles/${rolVendedor.id}`).set('Authorization', `Bearer ${admin.token}`).send({ activo: true }).expect(200);
    }
    await api(app).get('/api/v1/clientes/buscar?q=ta').set('Authorization', `Bearer ${vendedor.token}`).expect(200);
  });
});
