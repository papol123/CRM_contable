import { HttpLoggerMiddleware, sanitizeData, RouteParamsInterceptor } from './http-logger.middleware';
import { Logger } from '@nestjs/common';

describe('HttpLoggerMiddleware & Sanitization', () => {
  describe('sanitizeData', () => {
    it('debe proteger contraseñas, tokens y credenciales', () => {
      const input = {
        email: 'admin@crmcontable.com',
        password: 'SuperSecretPassword123!',
        contraseña: 'OtraClaveSegura',
        clave: '1234',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        client_secret: 'my-oauth-secret',
        cvv: '123',
        numero_tarjeta: '4111111111111111',
      };

      const result = sanitizeData(input);

      expect(result.email).toBe('admin@crmcontable.com');
      expect(result.password).toBe('*** [PROTEGIDO] ***');
      expect(result.contraseña).toBe('*** [PROTEGIDO] ***');
      expect(result.clave).toBe('*** [PROTEGIDO] ***');
      expect(result.token).toBe('*** [PROTEGIDO] ***');
      expect(result.accessToken).toBe('*** [PROTEGIDO] ***');
      expect(result.refreshToken).toBe('*** [PROTEGIDO] ***');
      expect(result.client_secret).toBe('*** [PROTEGIDO] ***');
      expect(result.cvv).toBe('*** [PROTEGIDO] ***');
      expect(result.numero_tarjeta).toBe('*** [PROTEGIDO] ***');
    });

    it('no debe alterar campos normales de negocio', () => {
      const input = {
        id: '12345',
        nombre: 'Carlos Andrés',
        nit: '900123456',
        razonSocial: 'Repuestos Bogotá SAS',
        precio: 45000,
        activo: true,
      };

      const result = sanitizeData(input);
      expect(result).toEqual(input);
    });

    it('debe sanitizar recursivamente objetos anidados y arrays', () => {
      const input = {
        usuario: {
          nombres: 'Carlos',
          auth: {
            password: 'secret',
            token: 'xyz',
          },
        },
        items: [
          { sku: 'REP-01', precio: 100 },
          { sku: 'REP-02', api_key: 'sensitive-api-key' },
        ],
      };

      const result = sanitizeData(input);

      expect(result.usuario.nombres).toBe('Carlos');
      expect(result.usuario.auth.password).toBe('*** [PROTEGIDO] ***');
      expect(result.usuario.auth.token).toBe('*** [PROTEGIDO] ***');
      expect(result.items[0]).toEqual({ sku: 'REP-01', precio: 100 });
      expect(result.items[1].sku).toBe('REP-02');
      expect(result.items[1].api_key).toBe('*** [PROTEGIDO] ***');
    });

    it('debe manejar valores nulos, indefinidos y primitivos sin fallar', () => {
      expect(sanitizeData(null)).toBeNull();
      expect(sanitizeData(undefined)).toBeUndefined();
      expect(sanitizeData('texto')).toBe('texto');
      expect(sanitizeData(123)).toBe(123);
    });
  });

  describe('HttpLoggerMiddleware', () => {
    let middleware: HttpLoggerMiddleware;
    let loggerLogSpy: jest.SpyInstance;
    let loggerWarnSpy: jest.SpyInstance;
    let loggerErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      middleware = new HttpLoggerMiddleware();
      loggerLogSpy = jest.spyOn((middleware as any).logger, 'log').mockImplementation();
      loggerWarnSpy = jest.spyOn((middleware as any).logger, 'warn').mockImplementation();
      loggerErrorSpy = jest.spyOn((middleware as any).logger, 'error').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('debe omitir assets estáticos como css o js de Swagger', () => {
      const req: any = { originalUrl: '/api/docs/swagger-ui.css', url: '/api/docs/swagger-ui.css' };
      const res: any = { on: jest.fn() };
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('debe registrar método, url, código 200, parámetros y cuerpo sanitizado al finalizar', () => {
      let finishCallback: () => void = () => {};
      const req: any = {
        method: 'POST',
        originalUrl: '/api/v1/auth/login',
        params: {},
        query: { ref: 'swagger' },
        body: {
          email: 'admin@repuestos.com',
          password: 'SecretPassword!',
        },
      };
      const res: any = {
        statusCode: 200,
        on: jest.fn((event, cb) => {
          if (event === 'finish') finishCallback = cb;
        }),
      };
      const next = jest.fn();

      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();

      // Disparar finish
      finishCallback();

      expect(loggerLogSpy).toHaveBeenCalled();
      const loggedMessage = loggerLogSpy.mock.calls[0][0];

      expect(loggedMessage).toContain('[POST] /api/v1/auth/login -> 200');
      expect(loggedMessage).toContain('Query params: {"ref":"swagger"}');
      expect(loggedMessage).toContain('Body: {"email":"admin@repuestos.com","password":"*** [PROTEGIDO] ***"}');
      expect(loggedMessage).not.toContain('SecretPassword!');
    });

    it('debe usar logger.warn para respuestas 4xx', () => {
      let finishCallback: () => void = () => {};
      const req: any = {
        method: 'GET',
        originalUrl: '/api/v1/usuarios/123',
        params: { id: '123' },
        query: {},
        body: null,
      };
      const res: any = {
        statusCode: 404,
        on: jest.fn((event, cb) => {
          if (event === 'finish') finishCallback = cb;
        }),
      };
      const next = jest.fn();

      middleware.use(req, res, next);
      finishCallback();

      expect(loggerWarnSpy).toHaveBeenCalled();
      const loggedMessage = loggerWarnSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('[GET] /api/v1/usuarios/123 -> 404');
      expect(loggedMessage).toContain('Parámetros de ruta: {"id":"123"}');
    });

    it('debe usar logger.error para respuestas 5xx', () => {
      let finishCallback: () => void = () => {};
      const req: any = {
        method: 'POST',
        originalUrl: '/api/v1/ventas',
        params: {},
        query: {},
        body: { total: 1000 },
      };
      const res: any = {
        statusCode: 500,
        on: jest.fn((event, cb) => {
          if (event === 'finish') finishCallback = cb;
        }),
      };
      const next = jest.fn();

      middleware.use(req, res, next);
      finishCallback();

      expect(loggerErrorSpy).toHaveBeenCalled();
      const loggedMessage = loggerErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('[POST] /api/v1/ventas -> 500');
    });
  });
});
