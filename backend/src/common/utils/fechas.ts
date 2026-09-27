const ZONA_HORARIA = process.env.APP_TIMEZONE || 'America/Bogota';

const formatoISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio.
 * `new Date().toISOString()` usa UTC y después de las 7 p. m. en Colombia
 * ya devuelve la fecha del día siguiente.
 */
export function fechaHoy(): string {
  return formatoISO.format(new Date());
}

export function sumarDias(fechaISO: string, dias: number): string {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Primer y último día del mes 'YYYY-MM'. */
export function rangoMes(periodo: string): { desde: string; hasta: string } {
  const [anio, mes] = periodo.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    desde: `${periodo}-01`,
    hasta: `${periodo}-${String(ultimoDia).padStart(2, '0')}`,
  };
}
