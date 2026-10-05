/**
 * CSV para exportaciones (separador ";" y BOM UTF-8 para que Excel en
 * español lo abra con tildes y columnas correctas).
 */

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let texto =
    valor instanceof Date
      ? valor.toISOString()
      : typeof valor === 'object'
        ? JSON.stringify(valor)
        : String(valor);
  // Evita inyección de fórmulas al abrir el archivo en una hoja de cálculo
  if (/^[=+\-@\t\r]/.test(texto) && !/^-?\d+(\.\d+)?$/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function generarCsv(filas: Array<Record<string, unknown>>, columnas?: string[]): Buffer {
  const encabezados = columnas || (filas.length ? Object.keys(filas[0]) : []);
  const lineas = [
    encabezados.map(celda).join(';'),
    ...filas.map((f) => encabezados.map((c) => celda(f[c])).join(';')),
  ];
  return Buffer.from('﻿' + lineas.join('\r\n'), 'utf8');
}
