import { Request } from 'express';

/**
 * Inspecciona las rutas registradas en el router de Express para determinar si una ruta
 * solicitada existe bajo otros verbos HTTP, permitiendo responder con HTTP 405 Method Not Allowed
 * y la cabecera 'Allow' requerida por los estándares REST y OWASP API8:2023.
 */
export function obtenerMetodosPermitidos(req: Request): string[] {
  const router = (req.app as any)?._router;
  if (!router?.stack) return [];

  const pathActual = req.path || req.url?.split('?')[0] || '';
  const metodos = new Set<string>();

  for (const layer of router.stack) {
    if (layer.route && layer.match(pathActual)) {
      for (const m of Object.keys(layer.route.methods || {})) {
        if (layer.route.methods[m]) metodos.add(m.toUpperCase());
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      // Sub-router montado (prefijo /api/v1)
      const subPath = pathActual.replace(/^\/api\/v1/, '') || '/';
      for (const subLayer of layer.handle.stack) {
        if (subLayer.route && subLayer.match(subPath)) {
          for (const m of Object.keys(subLayer.route.methods || {})) {
            if (subLayer.route.methods[m]) metodos.add(m.toUpperCase());
          }
        }
      }
    }
  }

  // Si se encontró algún método, OPTIONS siempre está implícito en HTTP
  if (metodos.size > 0) {
    metodos.add('OPTIONS');
  }

  return Array.from(metodos).sort();
}
