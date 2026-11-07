// lib/auth.ts — Gestión de sesión y RBAC granular según UX_MAPPING.MD §1.3
export interface JwtClaims {
  sub: string;
  email: string;
  rol: 'ADMIN' | 'USUARIO';
  permisos: string[];
  iat: number;
  exp: number;
}

export interface UserSession {
  sub: string;
  email: string;
  rol: 'ADMIN' | 'USUARIO';
  permisos: string[];
}

let inMemoryToken: string | null = null;
let sessionUser: UserSession | null = null;
let expirationTimer: NodeJS.Timeout | null = null;
let warningTimer: NodeJS.Timeout | null = null;

export function parseJwt(token: string): JwtClaims | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function setSession(token: string, userOverride?: Partial<UserSession>): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('crm_access_token', token);
    // Bandera de sesión activa para protección en Next.js Middleware (Edge Runtime)
    const isSecure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `crm_session_active=1; path=/; SameSite=Lax${isSecure}`;
  }

  const claims = parseJwt(token);
  if (claims) {
    sessionUser = {
      sub: claims.sub,
      email: claims.email,
      rol: claims.rol,
      permisos: userOverride?.permisos || claims.permisos || [],
    };
    setupSessionTimers(claims.exp);
  }
}

export function getAccessToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('crm_access_token');
    if (stored) {
      inMemoryToken = stored;
      const claims = parseJwt(stored);
      if (claims && (!sessionUser || !sessionUser.sub)) {
        sessionUser = {
          sub: claims.sub,
          email: claims.email,
          rol: claims.rol,
          permisos: claims.permisos || [],
        };
      }
      return stored;
    }
  }
  return null;
}

export function getCurrentUser(): UserSession | null {
  if (!sessionUser) {
    getAccessToken(); // Intentar rehidratar
  }
  return sessionUser;
}

export function can(permission: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.rol === 'ADMIN') return true; // Admin tiene acceso total
  return user.permisos.includes(permission);
}

export function clearSession(): void {
  inMemoryToken = null;
  sessionUser = null;
  if (expirationTimer) clearTimeout(expirationTimer);
  if (warningTimer) clearTimeout(warningTimer);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('crm_access_token');
    const isSecure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `crm_session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${isSecure}`;
  }
}

export function saveDraftsBeforeLeaving(): void {
  // Pilar RCE: Cero pérdida de datos ante desconexión o expiración
  // Se excluyen estrictamente campos de contraseñas, secretos o datos sensibles
  if (typeof window !== 'undefined') {
    const activeForms = document.querySelectorAll<HTMLFormElement>('form[data-auto-draft]');
    activeForms.forEach((form) => {
      const key = form.getAttribute('data-auto-draft');
      if (key) {
        const formData = new FormData(form);
        const entries: Record<string, any> = {};

        // Filtrar campos sensibles para prevenir fugas en localStorage
        const sensitiveRegex = /password|clave|token|secret|pin|cvv|tarjeta|credit/i;
        formData.forEach((value, fieldName) => {
          const inputEl = form.querySelector(`[name="${fieldName}"]`);
          const isPassword = inputEl?.getAttribute('type') === 'password';
          const isSensitive = inputEl?.hasAttribute('data-sensitive');
          const isSensitiveName = sensitiveRegex.test(fieldName);

          if (!isPassword && !isSensitive && !isSensitiveName) {
            entries[fieldName] = value;
          }
        });

        localStorage.setItem(`draft:${key}`, JSON.stringify(entries));
      }
    });
  }
}

function setupSessionTimers(expSeconds: number): void {
  if (expirationTimer) clearTimeout(expirationTimer);
  if (warningTimer) clearTimeout(warningTimer);

  const nowMs = Date.now();
  const expMs = expSeconds * 1000;
  const timeToWait = expMs - nowMs;

  if (timeToWait <= 0) return;

  // Aviso a los 13 min (2 min antes de vencer los 15 min)
  const warningTime = Math.max(0, timeToWait - 2 * 60 * 1000);
  warningTimer = setTimeout(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('session-expiring-warning'));
    }
  }, warningTime);

  // Expiración total a los 15 min
  expirationTimer = setTimeout(() => {
    saveDraftsBeforeLeaving();
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.assign(`/auth/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, timeToWait);
}
