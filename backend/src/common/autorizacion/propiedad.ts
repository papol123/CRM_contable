import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Actor } from '../../modules/auth/decorators/actor.decorator';

/**
 * Control de propiedad de recursos (GEMINI.md §5.4 · OWASP API1:2023 BOLA).
 *
 * Los permisos `*.consultar_todos` habilitan ver los documentos de cualquier
 * usuario; sin ellos, cada usuario solo ve y modifica los que registró.
 * Sin actor (llamadas internas entre servicios) no se restringe.
 */
export const PERMISOS_GLOBALES = {
  terceros: 'terceros.consultar_todos',
  ventas: 'ventas.consultar_todos',
  compras: 'compras.consultar_todos',
  cartera: 'cartera.consultar_todos',
} as const;

export function puedeVerTodos(actor: Actor | undefined, permiso: string): boolean {
  return !actor || actor.permisos.includes(permiso);
}

/** Id del usuario por el que se debe filtrar un listado, o null si ve todo. */
export function filtroPropietario(actor: Actor | undefined, permiso: string): string | null {
  return puedeVerTodos(actor, permiso) ? null : actor!.id;
}

/** Un recurso ajeno responde 404 para no revelar que existe (GEMINI.md §6). */
export function asegurarPropietario(
  idUsuarioRecurso: string | null | undefined,
  actor: Actor | undefined,
  permiso: string,
  mensaje: string,
): void {
  if (!puedeVerTodos(actor, permiso) && idUsuarioRecurso !== actor!.id) {
    throw new NotFoundException(mensaje);
  }
}

/** Consultas globales (sin filtro por tercero) reservadas a quien tiene el permiso global. */
export function exigirFiltroOPermiso(actor: Actor | undefined, permiso: string, filtro: unknown, campo: string): void {
  if (!filtro && !puedeVerTodos(actor, permiso)) {
    throw new ForbiddenException(`Indique ${campo}: la consulta global requiere el permiso ${permiso}`);
  }
}
