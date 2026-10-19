import { AppModule } from './app.module';
import { rutasRegistradas } from './common/rutas/rutas-registradas';

describe('Rutas registradas (catálogo §34: prueba estructural)', () => {
  const todas = rutasRegistradas(AppModule);

  it('encuentra las rutas de la API', () => {
    expect(todas.length).toBeGreaterThan(150);
  });

  it('toda ruta declara @RequirePermission, @Autenticado o @Public', () => {
    const sinDeclarar = todas.filter((r) => !r.publico && !r.autenticado && r.permisos.length === 0);
    expect(sinDeclarar.map((r) => `${r.http} ${r.ruta} (${r.controlador}.${r.metodo})`)).toEqual([]);
  });

  it('solo login, refresh, logout, recuperación de contraseña y salud son públicas', () => {
    const publicas = todas.filter((r) => r.publico).map((r) => `${r.http} ${r.ruta}`).sort();
    expect(publicas).toEqual(
      [
        'GET /health',
        'GET /health/ready',
        'GET /version',
        'POST /auth/forgot-password',
        'POST /auth/login',
        'POST /auth/logout',
        'POST /auth/refresh',
        'POST /auth/reset-password',
      ].sort(),
    );
  });

  it('no hay rutas duplicadas por rol (GEMINI.md §5.1)', () => {
    const claves = todas.map((r) => `${r.http} ${r.ruta}`);
    expect(claves.filter((c, i) => claves.indexOf(c) !== i)).toEqual([]);
    expect(todas.filter((r) => /\/(admin|usuario)\/(facturas|ventas|remisiones|pagos|clientes)/.test(r.ruta))).toEqual([]);
  });

  it('el directorio de terceros y las vistas globales exigen permisos *.consultar_todos (API5:2023)', () => {
    const permisoDe = (clave: string) => todas.find((r) => `${r.http} ${r.ruta}` === clave)?.permisos;
    const globales: Record<string, string> = {
      'GET /clientes': 'terceros.consultar_todos',
      'GET /clientes/:id': 'terceros.consultar_todos',
      'GET /clientes/:id/telefonos': 'terceros.consultar_todos',
      'GET /clientes/:id/correos': 'terceros.consultar_todos',
      'GET /clientes/:id/historial-compras': 'terceros.consultar_todos',
      'GET /proveedores': 'terceros.consultar_todos',
      'GET /proveedores/:id': 'terceros.consultar_todos',
      'GET /proveedores/:id/historial-compras': 'compras.consultar_todos',
      'GET /cartera/morosos': 'cartera.consultar_todos',
      'GET /cartera/vencida': 'cartera.consultar_todos',
      'GET /cartera/resumen': 'cartera.consultar_todos',
      'GET /reportes/cartera': 'cartera.consultar_todos',
      'GET /cuentas-por-pagar/proximas-vencer': 'compras.consultar_todos',
      'GET /cuentas-por-pagar/vencidas': 'compras.consultar_todos',
      'GET /dashboard/resumen': 'ventas.consultar_todos',
      'GET /reportes/ventas': 'ventas.consultar_todos',
    };
    for (const [clave, permiso] of Object.entries(globales)) {
      expect({ clave, permisos: permisoDe(clave) }).toEqual({ clave, permisos: [permiso] });
    }
    // Búsqueda liviana para operar sin el directorio completo
    expect(permisoDe('GET /clientes/buscar')).toEqual(['terceros.consultar']);
    expect(permisoDe('GET /proveedores/buscar')).toEqual(['terceros.consultar']);
  });

  it('la auditoría es de solo lectura (sin POST/PATCH/DELETE salvo exportar)', () => {
    const escrituras = todas.filter((r) => r.ruta.startsWith('/auditoria') && r.http !== 'GET');
    expect(escrituras.map((r) => `${r.http} ${r.ruta}`)).toEqual(['POST /auditoria/exportar']);
  });

  it('no se registran DIAN ni Siigo (fuera de alcance)', () => {
    expect(todas.filter((r) => /siigo|dian|resoluciones|xml-ubl/i.test(r.ruta))).toEqual([]);
  });

  it('las anulaciones exigen permisos administrativos', () => {
    const anulaciones = todas.filter((r) => /\/(anular|reversar|castigar)$/.test(r.ruta));
    expect(anulaciones.length).toBeGreaterThanOrEqual(7);
    for (const r of anulaciones) {
      expect(r.permisos.some((p) => /\.(anular|ajustar|gestionar)$/.test(p))).toBe(true);
    }
  });
});
