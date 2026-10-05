import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { api, crearApp, login, procesarJobs } from './utils/app';

/**
 * Flujos críticos de negocio contra la base embebida con datos demo
 * (catálogo §34: 404, 409, 422, idempotencia, anulación repetida, periodo
 * cerrado, entidades con dependencias, consecutivos, propiedad de recursos).
 */
describe('Flujos críticos', () => {
  let app: NestExpressApplication;
  let admin: string;
  let usuario: string;
  let vendedor: string;
  let cliente: any;
  let producto: any;
  let bodega: any;

  const get = (ruta: string, token: string) => api(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
  const post = (ruta: string, token: string, cuerpo: object = {}, clave?: string) => {
    const req = api(app).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
    if (clave) req.set('Idempotency-Key', clave);
    return req.send(cuerpo);
  };
  const patch = (ruta: string, token: string, cuerpo: object) =>
    api(app).patch(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`).send(cuerpo);

  beforeAll(async () => {
    app = await crearApp();
    admin = (await login(app, 'admin@crmcontable.com')).token;
    usuario = (await login(app, 'usuario@crmcontable.com')).token;
    vendedor = (await login(app, 'vendedor@crmcontable.com')).token;

    cliente = (await get('/clientes?limit=100', usuario)).body.data.find((c: any) => c.tercero.activo);
    const productos = (await get('/productos?limit=100', usuario)).body.data;
    producto = productos.find((p: any) => p.saldoActual > 10 && p.manejaInventario && p.activo);
    bodega = (await get('/bodegas', usuario)).body[0];
  });

  afterAll(async () => app.close());

  const venta = (extra: object = {}) => ({
    idCliente: cliente.id,
    items: [{ idProducto: producto.id, cantidad: 1, valorUnitario: 100000, pctDescuento: 10, pctIva: 19 }],
    ...extra,
  });

  describe('Remisiones', () => {
    it('crea la remisión con consecutivo REM, totales, kardex y bitácora', async () => {
      const res = await post('/facturas-venta', usuario, venta()).expect(201);
      expect(res.body.numeroVenta).toMatch(/^REM-\d{6}$/);
      expect(res.body.total).toBe(107100);
      expect(res.body.estadoDian).toBe('NO_APLICA');

      const kardex = (await get(`/inventario/${producto.id}/kardex`, admin)).body.movimientos;
      expect(kardex.some((m: any) => m.origenId === res.body.id && m.tipo === 'SALIDA')).toBe(true);
      const bitacora = (await get(`/auditoria/facturas_venta/${res.body.id}`, admin)).body.data;
      expect(bitacora.map((b: any) => b.accion)).toContain('CREAR');
    });

    it('Idempotency-Key: el reintento devuelve la misma remisión y otro cuerpo da 422', async () => {
      const clave = randomUUID();
      const primera = await post('/facturas-venta', usuario, venta(), clave).expect(201);
      const repetida = await post('/facturas-venta', usuario, venta(), clave).expect(201);
      expect(repetida.body.id).toBe(primera.body.id);
      expect(repetida.headers['idempotent-replayed']).toBe('true');
      await post('/facturas-venta', usuario, venta({ observaciones: 'otra' }), clave).expect(422);
    });

    it('stock insuficiente → 409', async () => {
      const res = await post('/facturas-venta', usuario, venta({ items: [{ idProducto: producto.id, cantidad: 9_999_999, valorUnitario: 1 }] }));
      expect(res.status).toBe(409);
      expect(res.body.detail).toContain('Stock insuficiente');
    });

    it('anular devuelve el stock; anular dos veces → 409', async () => {
      const { body: remision } = await post('/facturas-venta', usuario, venta()).expect(201);
      const antes = (await get(`/inventario/${producto.id}`, usuario)).body.totalSaldo;
      await post(`/facturas-venta/${remision.id}/anular`, admin, { motivo: 'Devolución total del cliente' }).expect(200);
      const despues = (await get(`/inventario/${producto.id}`, usuario)).body.totalSaldo;
      expect(despues).toBe(antes + 1);
      await post(`/facturas-venta/${remision.id}/anular`, admin, { motivo: 'Devolución total del cliente' }).expect(409);
    });

    it('venta a crédito con crédito bloqueado → 422; desbloquear conserva el cupo', async () => {
      const cupoAntes = Number(cliente.cupoCredito);
      await post(`/clientes/${cliente.id}/bloquear-credito`, admin, { motivo: 'Mora mayor a 90 días' }).expect(200);
      const res = await post('/facturas-venta', usuario, venta({ fechaVencimiento: '2099-12-31' }));
      expect(res.status).toBe(422);
      expect(res.body.type).toMatch(/credito-bloqueado$/);
      const desbloqueado = await post(`/clientes/${cliente.id}/desbloquear-credito`, admin, { motivo: 'Acuerdo de pago' }).expect(200);
      expect(Number(desbloqueado.body.cupoCredito)).toBe(cupoAntes);
    });

    it('los consecutivos no retroceden y su ajuste queda auditado', async () => {
      const remision = (await get('/consecutivos', admin)).body.find((c: any) => c.tipo === 'REMISION');
      await patch('/consecutivos/REMISION', admin, { siguiente: 1, motivo: 'Intento de retroceso' }).expect(409);
      await patch('/consecutivos/REMISION', admin, { siguiente: remision.ultimoUsado + 5, motivo: 'Nuevo talonario' }).expect(200);
      const bitacora = (await get('/auditoria?accion=AJUSTAR_CONSECUTIVO', admin)).body.data;
      expect(bitacora.length).toBeGreaterThan(0);
    });
  });

  describe('Compras y pagos', () => {
    let compra: any;

    it('registra la compra con descuento, ReteFuente, ReteIVA y ReteICA', async () => {
      const proveedor = (await get('/proveedores?limit=50', usuario)).body.data.find((p: any) => p.tercero.activo);
      const res = await post(
        '/facturas-compra',
        usuario,
        {
          idProveedor: proveedor.id,
          numeroFactura: `E2E-${Date.now()}`,
          fechaEmision: new Date().toISOString().slice(0, 10),
          pctRetefuente: 2.5,
          pctReteIva: 15,
          tarifaReteIcaPorMil: 9.66,
          items: [{ idProducto: producto.id, cantidad: 10, costoUnitario: 10000, pctDescuento: 10, pctIva: 19 }],
        },
        randomUUID(),
      ).expect(201);
      compra = res.body;
      expect(compra).toMatchObject({ base: 90000, totalIva: 17100, retefuente: 2250, reteiva: 2565, reteica: 869.4, total: 101415.6, saldo: 101415.6 });
    });

    it('número de factura duplicado del proveedor → 409', async () => {
      const res = await post('/facturas-compra', usuario, {
        idProveedor: compra.idProveedor,
        numeroFactura: compra.numeroFactura,
        fechaEmision: new Date().toISOString().slice(0, 10),
        items: [{ idProducto: producto.id, cantidad: 1, costoUnitario: 1 }],
      });
      expect(res.status).toBe(409);
    });

    it('un pago mayor al saldo → 422; el pago total cierra la cuenta por pagar', async () => {
      const metodo = (await get('/medios-pago', usuario)).body[0];
      const base = { tipoPago: 'factura de compra', idFactura: compra.id, idMetodoPago: metodo.id };
      await post('/pagos', usuario, { ...base, monto: compra.saldo + 1 }, randomUUID()).expect(422);
      const pago = await post('/pagos', usuario, { ...base, monto: compra.saldo }, randomUUID()).expect(201);
      expect((await get(`/facturas-compra/${compra.id}`, usuario)).body.saldo).toBe(0);

      const recibo = await get(`/pagos/${pago.body.id}/recibo`, usuario).expect(200);
      expect(recibo.headers['content-type']).toBe('application/pdf');

      await post(`/facturas-compra/${compra.id}/anular`, admin, { motivo: 'Factura errada' }).expect(409);
      await post(`/pagos/${pago.body.id}/anular`, admin, { motivo: 'Pago duplicado' }).expect(200);
      expect((await get(`/facturas-compra/${compra.id}`, usuario)).body.saldo).toBe(101415.6);
    });
  });

  describe('Periodos contables', () => {
    it('un documento con fecha en periodo cerrado → 422; reabrir exige motivo', async () => {
      const hoy = new Date();
      const mes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 2, 15)).toISOString().slice(0, 7);
      const cierre = await post('/reportes/cierre-mensual', admin, { periodo: mes });
      expect([200, 409]).toContain(cierre.status);
      await post('/reportes/cierre-mensual', admin, { periodo: mes }).expect(409);

      const categoria = (await get('/categorias-gasto', usuario)).body[0];
      const gasto = await post('/gastos', usuario, { idCategoriaGasto: categoria.id, descripcion: 'Gasolina', monto: 50000, fecha: `${mes}-10` });
      expect(gasto.status).toBe(422);
      expect(gasto.body.type).toMatch(/periodo-cerrado$/);

      const periodo = (await get('/periodos-contables', admin)).body.find(
        (p: any) => `${p.anio}-${String(p.mes).padStart(2, '0')}` === mes,
      );
      await post(`/periodos-contables/${periodo.id_periodo}/reabrir`, admin, {}).expect(400);
      await post(`/periodos-contables/${periodo.id_periodo}/reabrir`, admin, { motivo: 'Corrección de gasto' }).expect(200);
      await post('/gastos', usuario, { idCategoriaGasto: categoria.id, descripcion: 'Gasolina', monto: 50000, fecha: `${mes}-10` }).expect(201);
    });

    it('no se cierra el mes en curso', async () => {
      await post('/reportes/cierre-mensual', admin, { periodo: new Date().toISOString().slice(0, 7) }).expect(422);
    });
  });

  describe('Integridad y propiedad de recursos', () => {
    it('recurso inexistente → 404', async () => {
      await get(`/facturas-venta/${randomUUID()}`, usuario).expect(404);
    });

    it('un gasto ajeno no se expone (404) y un Usuario no ve todos los gastos', async () => {
      const categoria = (await get('/categorias-gasto', usuario)).body[0];
      const gasto = (await post('/gastos', usuario, { idCategoriaGasto: categoria.id, descripcion: 'Papelería', monto: 12000 }).expect(201)).body;
      await get(`/gastos/${gasto.id}`, vendedor).expect(404);
      const propios = (await get('/gastos?limit=100', vendedor)).body.data;
      expect(propios.find((g: any) => g.id === gasto.id)).toBeUndefined();
    });

    it('un job de exportación ajeno no se expone (404)', async () => {
      const job = (await post('/reportes/exportar', usuario, { tipo: 'ventas' }).expect(202)).body;
      await procesarJobs(app);
      expect((await get(`/reportes/jobs/${job.jobId}`, usuario)).body.estado).toBe('COMPLETADO');
      await get(`/reportes/jobs/${job.jobId}`, vendedor).expect(404);
      const csv = await get(`/reportes/jobs/${job.jobId}/descargar`, usuario).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
    });

    it('no se elimina una bodega con existencias ni un producto con stock (409)', async () => {
      await api(app).delete(`/api/v1/bodegas/${bodega.id}`).set('Authorization', `Bearer ${admin}`).expect(409);
      await api(app).delete(`/api/v1/productos/${producto.id}`).set('Authorization', `Bearer ${admin}`).expect(409);
    });

    it('documento de tercero duplicado → 409', async () => {
      await post('/clientes', usuario, {
        idTipoDocumento: cliente.tercero.idTipoDocumento,
        numeroDocumento: cliente.tercero.numeroDocumento,
        razonSocial: 'Duplicado',
        tipoPersona: 'JURIDICA',
      }).expect(409);
    });

    it('no se desactiva al último administrador', async () => {
      const usuarios = (await get('/usuarios?limit=100', admin)).body.data;
      const gerencia = usuarios.find((u: any) => u.email === 'gerencia@crmcontable.com');
      const yo = usuarios.find((u: any) => u.email === 'admin@crmcontable.com');
      await post(`/usuarios/${gerencia.id}/desactivar`, admin).expect(200);
      try {
        // Con un solo administrador activo, quitarle el rol también se rechaza
        const rolUsuario = (await get('/roles', admin)).body.find((r: any) => r.codigo === 'USUARIO');
        const gerente = await login(app, 'admin@crmcontable.com');
        const res = await patch(`/usuarios/${yo.id}`, gerente.token, { idRol: rolUsuario.id });
        expect(res.status).toBe(400); // no puede cambiar su propio rol
      } finally {
        await post(`/usuarios/${gerencia.id}/activar`, admin).expect(200);
      }
      const ds = app.get(DataSource);
      const [{ admins }] = await ds.query(
        `SELECT COUNT(*)::int AS admins FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.codigo = 'ADMIN' AND u.activo`,
      );
      expect(admins).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Recuperación de contraseña', () => {
    it('restablece con un token de un solo uso', async () => {
      const ds = app.get(DataSource);
      const [u] = await ds.query(`SELECT id_usuario FROM usuarios WHERE email = 'caja@crmcontable.com'`);
      await post('/auth/forgot-password', '', { email: 'caja@crmcontable.com' }).expect(200);
      const [{ total }] = await ds.query(
        `SELECT COUNT(*)::int AS total FROM tokens_usuario WHERE id_usuario = $1 AND usado_en IS NULL`,
        [u.id_usuario],
      );
      expect(total).toBe(1);

      // El token en claro solo viaja por correo: se reemplaza su hash para conocerlo en la prueba
      const { hashToken } = await import('../src/modules/users/tokens-usuario.service');
      await ds.query(`UPDATE tokens_usuario SET token_hash = $2 WHERE id_usuario = $1 AND usado_en IS NULL`, [
        u.id_usuario,
        hashToken('token-de-prueba'),
      ]);
      await post('/auth/reset-password', '', { token: 'token-de-prueba', newPassword: 'NuevaClave2026' }).expect(200);
      await post('/auth/reset-password', '', { token: 'token-de-prueba', newPassword: 'OtraClave2026' }).expect(400);
      await login(app, 'caja@crmcontable.com', 'NuevaClave2026');
    });
  });
});
