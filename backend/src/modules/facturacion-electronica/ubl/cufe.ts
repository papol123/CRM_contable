import { createHash } from 'crypto';

export interface DatosCufe {
  numeroFactura: string; // prefijo + consecutivo, p. ej. SETP990000001
  fechaEmision: string; // YYYY-MM-DD
  horaEmision: string; // HH:mm:ss-05:00
  valorBruto: number; // LineExtensionAmount: subtotal sin impuestos
  valorIva: number; // impuesto 01
  valorInc: number; // impuesto 04
  valorIca: number; // impuesto 03
  valorTotal: number; // PayableAmount
  nitEmisor: string; // sin DV
  documentoAdquiriente: string; // sin DV
  claveTecnica: string; // de la resolución de numeración electrónica
  tipoAmbiente: '1' | '2'; // 1 producción, 2 pruebas
}

const dosDecimales = (valor: number) => valor.toFixed(2);

/**
 * CUFE: SHA-384 de la concatenación definida en el anexo técnico de
 * factura electrónica de venta (NumFac + FecFac + HorFac + ValFac + 01 +
 * ValImp1 + 04 + ValImp2 + 03 + ValImp3 + ValTot + NitOFE + NumAdq +
 * ClTec + TipoAmbiente).
 */
export function calcularCufe(d: DatosCufe): string {
  const cadena =
    d.numeroFactura +
    d.fechaEmision +
    d.horaEmision +
    dosDecimales(d.valorBruto) +
    '01' +
    dosDecimales(d.valorIva) +
    '04' +
    dosDecimales(d.valorInc) +
    '03' +
    dosDecimales(d.valorIca) +
    dosDecimales(d.valorTotal) +
    d.nitEmisor +
    d.documentoAdquiriente +
    d.claveTecnica +
    d.tipoAmbiente;
  return createHash('sha384').update(cadena, 'utf8').digest('hex');
}
