import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { QueryFailedError } from 'typeorm';
import { GlobalHttpExceptionFilter, TIPO_PROBLEMA_BASE } from './http-exception.filter';

describe('GlobalHttpExceptionFilter (RFC 9457)', () => {
  const filtro = new GlobalHttpExceptionFilter();
  const solicitud = { originalUrl: '/api/v1/facturas-venta', url: '/facturas-venta' };

  it('arma type, title, status, detail e instance', () => {
    const p = filtro.construir(new NotFoundException('Remisión no encontrada'), solicitud);
    expect(p).toEqual({
      type: `${TIPO_PROBLEMA_BASE}/no-encontrado`,
      title: 'Recurso no encontrado',
      status: 404,
      detail: 'Remisión no encontrada',
      instance: '/api/v1/facturas-venta',
    });
  });

  it('permite un tipo específico desde el servicio', () => {
    const p = filtro.construir(
      new ConflictException({ message: 'Stock insuficiente', tipo: 'stock-insuficiente' }),
      solicitud,
    );
    expect(p.type).toBe(`${TIPO_PROBLEMA_BASE}/stock-insuficiente`);
    expect(p.status).toBe(409);
  });

  it('lista los errores de validación en `errors`', () => {
    const p = filtro.construir(new BadRequestException({ message: ['monto debe ser positivo', 'idCliente es requerido'] }), solicitud);
    expect(p.status).toBe(400);
    expect(p.errors).toEqual(['monto debe ser positivo', 'idCliente es requerido']);
  });

  it.each([
    [new ForbiddenException('x'), 403, 'sin-permiso'],
    [new UnprocessableEntityException('x'), 422, 'regla-de-negocio'],
    [new ThrottlerException(), 429, 'demasiadas-solicitudes'],
  ])('%s → %d', (excepcion, status, tipo) => {
    const p = filtro.construir(excepcion, solicitud);
    expect(p.status).toBe(status);
    expect(p.type).toBe(`${TIPO_PROBLEMA_BASE}/${tipo}`);
  });

  it('un duplicado de PostgreSQL es 409 y una FK inválida es 400', () => {
    const duplicado = Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), { code: '23505' });
    const fk = Object.assign(new QueryFailedError('INSERT', [], new Error('fk')), { code: '23503' });
    expect(filtro.construir(duplicado, solicitud).status).toBe(409);
    expect(filtro.construir(fk, solicitud).status).toBe(400);
  });

  it('la base de datos caída responde 503', () => {
    const caida = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const p = filtro.construir(caida, solicitud);
    expect(p.status).toBe(503);
    expect(p.type).toBe(`${TIPO_PROBLEMA_BASE}/dependencia-no-disponible`);
  });

  it('en producción no expone detalles de errores internos', () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const p = filtro.construir(new Error('column "x" does not exist'), solicitud);
      expect(p.status).toBe(500);
      expect(p.detail).not.toContain('column');
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });
});
