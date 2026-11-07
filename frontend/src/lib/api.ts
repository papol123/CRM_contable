// lib/api.ts — Cliente HTTP base según UX_MAPPING.MD §1.2 y RFC 9457
import { getAccessToken, clearSession, saveDraftsBeforeLeaving } from './auth';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export type SecurityEventType =
  | 'AUTH_401'
  | 'FORBIDDEN_403'
  | 'RATE_LIMIT_429'
  | 'CSP_VIOLATION'
  | 'UNSAFE_UPLOAD';

export interface SecurityMetricEvent {
  type: SecurityEventType;
  path?: string;
  detail?: string;
  status?: number;
  timestamp?: string;
}

/**
 * Registra y propaga métricas y eventos de seguridad en el frontend.
 * Permite observabilidad de incidentes como fuerza bruta, intentos de escalada o violaciones de políticas.
 */
export function reportSecurityMetric(event: SecurityMetricEvent): void {
  const payload = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
  };

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[SECURITY METRIC] ${payload.type}:`, payload);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm-security-event', { detail: payload }));
  }
}

export interface ProblemDetails {
  type: string;        // ej. "https://api.crmcontable.com/errors/stock-insuficiente"
  title: string;       // ej. "Stock insuficiente"
  status?: number;
  detail?: string;     // Mensaje legible para el usuario
  instance: string;    // Ruta que falló
  errors?: Array<{ field?: string; message: string } | string>; // Validación de DTO 400
}

export class ApiError extends Error {
  constructor(public status: number, public problem: ProblemDetails) {
    super(problem.detail ?? problem.title ?? `Error ${status}`);
    this.name = 'ApiError';
  }

  get kind(): string {
    return this.problem.type ? (this.problem.type.split('/').pop() || '') : '';
  }
}

export type RequestOpts = RequestInit & {
  idempotencyKey?: string;
  raw?: boolean;
};

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(opts.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (opts.body && !(opts.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (opts.idempotencyKey) {
    headers.set('Idempotency-Key', opts.idempotencyKey);
  }

  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, { ...opts, headers });

  // Registro de telemetría de seguridad según código de respuesta
  if (res.status === 401) {
    reportSecurityMetric({
      type: 'AUTH_401',
      path,
      status: 401,
      detail: 'Sesión no autorizada o token JWT expirado',
    });
    if (!path.includes('/auth/')) {
      saveDraftsBeforeLeaving();
      clearSession();
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        window.location.assign(`/auth/login?next=${encodeURIComponent(currentPath)}`);
      }
    }
  } else if (res.status === 403) {
    reportSecurityMetric({
      type: 'FORBIDDEN_403',
      path,
      status: 403,
      detail: 'Intento de acceso a recurso restringido (falta de permiso granular)',
    });
  } else if (res.status === 429) {
    reportSecurityMetric({
      type: 'RATE_LIMIT_429',
      path,
      status: 429,
      detail: 'Límite de tasa superado (posible ráfaga o fuerza bruta)',
    });
  }

  if (!res.ok) {
    let problem: ProblemDetails;
    const isJson = res.headers.get('content-type')?.includes('json');
    if (isJson) {
      try {
        problem = await res.json();
      } catch {
        problem = {
          type: 'about:blank',
          title: res.statusText || 'Error inesperado',
          status: res.status,
          instance: path,
        };
      }
    } else {
      problem = {
        type: 'about:blank',
        title: res.statusText || 'Error de red',
        status: res.status,
        instance: path,
      };
    }
    throw new ApiError(res.status, problem);
  }

  if (opts.raw) {
    return res as unknown as T;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json();
}
