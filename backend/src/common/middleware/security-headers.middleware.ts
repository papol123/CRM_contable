import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para aplicar cabeceras HTTP de seguridad según los estándares OWASP Top 10 (A02:2025),
 * OWASP API Security Top 10 (API8:2023) y OWASP Proactive Controls (C8: Browser Security).
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Ocultar información del servidor y tecnología backend
  res.removeHeader('X-Powered-By');

  // Prevenir ataques de tipo MIME Sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevenir Clickjacking en navegadores modernos y legados
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Política de referrers para evitar fuga de tokens o rutas internas
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Deshabilitar la ejecución de Adobe Flash / PDF cross-domain
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Deshabilitar el filtro XSS obsoleto y vulnerable de navegadores antiguos a favor de CSP
  res.setHeader('X-XSS-Protection', '0');

  // Content Security Policy defensivo para API REST
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; object-src 'none'");

  // Strict-Transport-Security (HSTS) para forzar HTTPS en producción o si la petición es segura
  const esProduccion = process.env.NODE_ENV === 'production';
  const esHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (esProduccion || esHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}
