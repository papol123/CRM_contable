/** Pesos del algoritmo de dígito de verificación de la DIAN (de derecha a izquierda). */
const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 67, 71];

/** Dígito de verificación de un NIT (módulo 11 de la DIAN). */
export function digitoVerificacion(nit: string): number {
  const digitos = nit.replace(/\D/g, '');
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS_DV[i];
  }
  const residuo = suma % 11;
  return residuo > 1 ? 11 - residuo : residuo;
}

/**
 * Separa un NIT guardado como '900123456-1' en número y DV. Si viene sin DV,
 * lo calcula. Para cédulas (sin guion) el DV no aplica pero se calcula igual.
 */
export function separarNit(documento: string): { numero: string; dv: number } {
  const [numero] = documento.split('-');
  const limpio = numero.replace(/\D/g, '');
  return { numero: limpio, dv: digitoVerificacion(limpio) };
}

/** Código DIAN del tipo de documento de identificación (tabla 13.2.1 del anexo técnico). */
export function codigoTipoDocumento(codigoInterno?: string): string {
  const mapa: Record<string, string> = {
    NIT: '31',
    CC: '13',
    CE: '22',
    PAS: '41',
    TI: '12',
    PPT: '48',
  };
  return mapa[codigoInterno ?? ''] ?? '13';
}
