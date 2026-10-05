import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const AUTENTICADO_KEY = 'soloAutenticado';

/** Exige todos los permisos indicados (GEMINI.md §5.1: autorización por permisos, no por rol). */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Declara explícitamente que la ruta solo requiere sesión válida (perfil
 * propio, jobs propios). La prueba estructural exige que toda ruta tenga
 * @RequirePermission, @Autenticado o @Public.
 */
export const Autenticado = () => SetMetadata(AUTENTICADO_KEY, true);
