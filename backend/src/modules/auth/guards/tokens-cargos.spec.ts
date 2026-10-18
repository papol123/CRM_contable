import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AuditoriaService } from '../../auditoria/auditoria.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const base = require('../../../../scripts/data/base');

describe('Segregación de funciones y restricción de tokens por cargo (Least Privilege / OWASP A01:2025)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let auditoriaService: jest.Mocked<AuditoriaService>;

  beforeEach(() => {
    reflector = new Reflector();
    auditoriaService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    } as any;
    guard = new PermissionsGuard(reflector, auditoriaService);
  });

  function mockContext(permisosUsuario: string[], requiredPermissions?: string[]): ExecutionContext {
    jest.spyOn(reflector, 'get').mockReturnValue(false); // No @Autenticado en handler
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions);

    const request = {
      method: 'POST',
      originalUrl: '/test-endpoint',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Jest-Test' },
      user: {
        id: 'user-uuid-1',
        email: 'test@crmcontable.com',
        permisos: permisosUsuario,
      },
    };

    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  describe('Cargo Vendedor (rol VENDEDOR)', () => {
    const permisosVendedor = base.permisosPorRol.VENDEDOR;

    it('tiene exactamente los permisos autorizados para ventas y atención comercial', () => {
      expect(permisosVendedor).toEqual(
        expect.arrayContaining([
          'ventas.consultar',
          'ventas.crear',
          'inventario.consultar',
          'cartera.consultar',
          'terceros.consultar',
          'terceros.crear',
          'terceros.editar',
          'reportes.exportar',
        ]),
      );
    });

    it('permite crear ventas y cotizaciones (ventas.crear)', () => {
      const ctx = mockContext(permisosVendedor, ['ventas.crear']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('permite consultar existencias de inventario (inventario.consultar)', () => {
      const ctx = mockContext(permisosVendedor, ['inventario.consultar']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bloquea terminantemente crear compras a proveedores (compras.crear)', () => {
      const ctx = mockContext(permisosVendedor, ['compras.crear']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(auditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACCESO_DENEGADO',
          resultado: 'FALLO',
        }),
      );
    });

    it('bloquea registrar gastos corporativos (gastos.registrar)', () => {
      const ctx = mockContext(permisosVendedor, ['gastos.registrar']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea movimientos directos de almacén (inventario.movimientos)', () => {
      const ctx = mockContext(permisosVendedor, ['inventario.movimientos']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea creación y modificación de productos en el catálogo (productos.crear)', () => {
      const ctx = mockContext(permisosVendedor, ['productos.crear']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea recaudo y registro de pagos en caja (pagos.registrar)', () => {
      const ctx = mockContext(permisosVendedor, ['pagos.registrar']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('Cargo Cajero (rol CAJERO)', () => {
    const permisosCajero = base.permisosPorRol.CAJERO;

    it('permite registrar pagos y abonos (pagos.registrar)', () => {
      const ctx = mockContext(permisosCajero, ['pagos.registrar']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('permite consultar facturas y cartera para gestionar cobros', () => {
      const ctx1 = mockContext(permisosCajero, ['ventas.consultar']);
      const ctx2 = mockContext(permisosCajero, ['cartera.consultar']);
      expect(guard.canActivate(ctx1)).toBe(true);
      expect(guard.canActivate(ctx2)).toBe(true);
    });

    it('bloquea crear facturas de venta o cotizaciones (ventas.crear)', () => {
      const ctx = mockContext(permisosCajero, ['ventas.crear']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea crear compras a proveedores (compras.crear)', () => {
      const ctx = mockContext(permisosCajero, ['compras.crear']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea movimientos de inventario de bodega (inventario.movimientos)', () => {
      const ctx = mockContext(permisosCajero, ['inventario.movimientos']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea creación y alteración de productos (productos.crear)', () => {
      const ctx = mockContext(permisosCajero, ['productos.crear']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('Cargo Encargado de Bodega (rol BODEGA)', () => {
    const permisosBodega = base.permisosPorRol.BODEGA;

    it('permite consultar inventario y registrar movimientos (entradas, salidas, traslados)', () => {
      const ctx1 = mockContext(permisosBodega, ['inventario.consultar']);
      const ctx2 = mockContext(permisosBodega, ['inventario.movimientos']);
      expect(guard.canActivate(ctx1)).toBe(true);
      expect(guard.canActivate(ctx2)).toBe(true);
    });

    it('permite consultar órdenes de compra para recepción física (compras.consultar)', () => {
      const ctx = mockContext(permisosBodega, ['compras.consultar']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bloquea emitir ventas a clientes (ventas.crear)', () => {
      const ctx = mockContext(permisosBodega, ['ventas.crear']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea registrar pagos y tocar caja (pagos.registrar)', () => {
      const ctx = mockContext(permisosBodega, ['pagos.registrar']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea registrar gastos corporativos (gastos.registrar)', () => {
      const ctx = mockContext(permisosBodega, ['gastos.registrar']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('bloquea consultar estados de cuenta y cartera (cartera.consultar)', () => {
      const ctx = mockContext(permisosBodega, ['cartera.consultar']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('Auditoría estricta de violaciones de permisos (RFC 9457 / OWASP A09)', () => {
    it('genera evento de ACCESO_DENEGADO con IP, ruta y permisos faltantes', () => {
      const ctx = mockContext(['ventas.consultar'], ['ventas.anular']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(auditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACCESO_DENEGADO',
          recurso: 'auth',
          valorNuevo: expect.objectContaining({
            permisosFaltantes: ['ventas.anular'],
          }),
          resultado: 'FALLO',
        }),
      );
    });
  });
});
