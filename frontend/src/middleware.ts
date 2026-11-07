import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware — Protección perimetral de rutas privadas.
 * Intercepta peticiones antes de servir el bundle en el navegador.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas de autenticación y recursos que no requieren validación perimetral
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') // Archivos estáticos (.ico, .svg, .png, etc.)
  ) {
    return NextResponse.next();
  }

  // Verificar presencia de sesión activa
  const sessionCookie = request.cookies.get('crm_session_active');

  // Si no hay sesión activa y no es la raíz pública, redirigir a login preservando nextUrl seguro
  if (!sessionCookie && pathname !== '/') {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

