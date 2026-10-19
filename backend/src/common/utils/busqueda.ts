/** Máximo de coincidencias que devuelven las búsquedas livianas (selectores). */
export const LIMITE_BUSQUEDA = 20;

/**
 * Patrón para `LOWER(col) LIKE :patron`: escapa los comodines del texto del
 * usuario (% _ \) para que una búsqueda como "%" no recorra toda la tabla.
 */
export function patronLike(texto: string): string {
  return `%${texto.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
