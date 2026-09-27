const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'crm_access_token';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  rol: string | {
    nombre: string;
    permisos?: string[];
  };
  permisos?: string[];
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

// ─── Token helpers ──────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function loginRequest(credentials: LoginCredentials): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // needed for HttpOnly refresh-token cookie
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new Error('El backend no está corriendo. En la carpeta del backend ejecuta npm run start:dev');
  }

  if (!res.ok) {
    // El backend distingue credenciales inválidas de usuario inactivo: se muestra su mensaje
    const error = await res.json().catch(() => ({}));
    const message = Array.isArray(error.message) ? error.message.join('. ') : error.message;
    const porDefecto =
      res.status === 401
        ? 'Email o contraseña incorrectos, o ese usuario no existe en la base'
        : res.status === 404
          ? 'La ruta no existe todavía o su prefijo no es /api/v1'
          : `Error del servidor (${res.status})`;
    throw new Error(message || porDefecto);
  }

  return res.json();
}

export async function logoutRequest(): Promise<void> {
  const token = getToken();
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
  } catch {
    // Silently ignore network failure on logout
  } finally {
    removeToken();
  }
}

export async function refreshRequest(): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    removeToken();
    throw new Error('El backend no está corriendo. En la carpeta del backend ejecuta npm run start:dev');
  }

  if (!res.ok) {
    removeToken();
    throw new Error('Sesión expirada');
  }

  return res.json();
}

export async function getMeRequest(): Promise<AuthUser> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
  } catch {
    throw new Error('El backend no está corriendo. En la carpeta del backend ejecuta npm run start:dev');
  }

  if (res.status === 401) {
    throw new Error('Email o contraseña incorrectos, o ese usuario no existe en la base');
  }
  if (res.status === 404) {
    throw new Error('La ruta no existe todavía o su prefijo no es /api/v1');
  }
  if (!res.ok) throw new Error('No autenticado');
  return res.json();
}
