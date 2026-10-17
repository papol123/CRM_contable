import { securityHeadersMiddleware } from './security-headers.middleware';

describe('securityHeadersMiddleware (OWASP Proactive C8 & API8:2023)', () => {
  it('debe aplicar cabeceras de seguridad requeridas y eliminar X-Powered-By', () => {
    const headers: Record<string, string> = {};
    const req: any = { secure: false, headers: {} };
    const res: any = {
      removeHeader: jest.fn(),
      setHeader: jest.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      }),
    };
    const next = jest.fn();

    securityHeadersMiddleware(req, res, next);

    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-permitted-cross-domain-policies']).toBe('none');
    expect(headers['x-xss-protection']).toBe('0');
    expect(headers['content-security-policy']).toBe("default-src 'self'; frame-ancestors 'none'; object-src 'none'");
    expect(next).toHaveBeenCalled();
  });

  it('debe incluir Strict-Transport-Security en peticiones seguras HTTPS', () => {
    const headers: Record<string, string> = {};
    const req: any = { secure: true, headers: {} };
    const res: any = {
      removeHeader: jest.fn(),
      setHeader: jest.fn((name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      }),
    };
    const next = jest.fn();

    securityHeadersMiddleware(req, res, next);

    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
    expect(next).toHaveBeenCalled();
  });
});
