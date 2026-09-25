import { getToken, removeToken, refreshRequest } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export class ApiException extends Error {
  statusCode: number;
  error?: string;

  constructor(statusCode: number, message: string, error?: string) {
    super(message);
    this.name = 'ApiException';
    this.statusCode = statusCode;
    this.error = error;
  }
}

/**
 * Cliente HTTP unificado con soporte para autenticación Bearer,
 * renovación automática de tokens e interpretación estandarizada de errores HTTP
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  let response = await fetch(`${API_URL}${endpoint}`, config);

  // Intento de refresco de token si expira (401)
  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    try {
      const refreshed = await refreshRequest();
      if (refreshed?.accessToken) {
        headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
        response = await fetch(`${API_URL}${endpoint}`, {
          ...config,
          headers,
        });
      }
    } catch {
      removeToken();
    }
  }

  // Manejo de respuesta vacía (ej. 204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join('. ')
      : data.message || `Error HTTP ${response.status}: ${response.statusText}`;

    throw new ApiException(response.status, message, data.error);
  }

  return data as T;
}

// ─── Tipos de Datos ──────────────────────────────────────────────────────────

export interface PermissionItem {
  id: string;
  modulo: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
}

export interface RoleItem {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  permisos: PermissionItem[];
}

export interface UserItem {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  telefono?: string;
  activo: boolean;
  ultimoLogin?: string;
  creadoEn: string;
  idRol: string;
  rol?: RoleItem;
}

export interface CreateUserInput {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
  telefono?: string;
  idRol: string;
  activo?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  nombres?: string;
  apellidos?: string;
  telefono?: string;
  idRol?: string;
  activo?: boolean;
}

// ─── Servicios para Usuarios y Roles ─────────────────────────────────────────

export async function fetchUsers(search?: string, idRol?: string): Promise<UserItem[]> {
  const params = new URLSearchParams();
  if (search && search.trim()) params.append('search', search.trim());
  if (idRol && idRol.trim()) params.append('idRol', idRol.trim());

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<UserItem[]>(`/users${query}`);
}

export async function fetchRoles(): Promise<RoleItem[]> {
  return apiFetch<RoleItem[]>('/users/roles');
}

export async function fetchUserById(id: string): Promise<UserItem> {
  return apiFetch<UserItem>(`/users/${id}`);
}

export async function createUser(data: CreateUserInput): Promise<UserItem> {
  return apiFetch<UserItem>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: string, data: UpdateUserInput): Promise<UserItem> {
  return apiFetch<UserItem>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/users/${id}`, {
    method: 'DELETE',
  });
}
