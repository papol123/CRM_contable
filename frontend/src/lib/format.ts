// lib/format.ts — Formateo numérico, monetario y de fechas según UX_MAPPING.MD §1.8

export function formatCOP(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '$ 0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$ 0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(val: number | string | null | undefined, decimals = 0): string {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      // YYYY-MM-DD -> DD/MM/YYYY
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('es-CO');
  } catch {
    return dateStr;
  }
}

export function formatPeriodo(periodoStr: string | null | undefined): string {
  if (!periodoStr) return '—';
  // YYYY-MM -> Mes AAAA
  const [year, month] = periodoStr.split('-');
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const mIndex = parseInt(month, 10) - 1;
  if (mIndex >= 0 && mIndex < 12) {
    return `${monthNames[mIndex]} ${year}`;
  }
  return periodoStr;
}

export function cleanIdentification(input: string): string {
  // Elimina puntos, guiones y espacios según prevención RCE
  return input.replace(/[\.\-\s]/g, '');
}
