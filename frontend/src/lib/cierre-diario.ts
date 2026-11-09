/**
 * Enlace entre el Cierre Diario y los formularios reales (remisión, compra).
 * El cierre abre el formulario con ?origen=cierre-diario&fecha=YYYY-MM-DD; el
 * formulario usa esa fecha para el documento y, al guardar, vuelve al cierre.
 * La ruta de regreso es fija (no se toma de la URL) para evitar redirecciones abiertas.
 */
const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const RUTA_CIERRE_DIARIO = '/contabilidad/cierre/diario';

/** Fecha local YYYY-MM-DD (toISOString usa UTC y adelanta el día en la noche). */
export function fechaLocalHoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sumarDiasISO(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function esFechaValida(valor: string | null | undefined): valor is string {
  return !!valor && FECHA.test(valor);
}

/** Fecha del cierre si el formulario se abrió desde el Cierre Diario; si no, null. */
export function leerOrigenCierre(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const fecha = params.get('fecha');
  return params.get('origen') === 'cierre-diario' && esFechaValida(fecha) ? fecha : null;
}

export function rutaCierre(fecha: string): string {
  return `${RUTA_CIERRE_DIARIO}?fecha=${fecha}`;
}

export function rutaDesdeCierre(ruta: string, fecha: string): string {
  return `${ruta}?origen=cierre-diario&fecha=${fecha}`;
}
