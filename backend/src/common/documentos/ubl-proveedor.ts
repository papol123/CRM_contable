import { UnprocessableEntityException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

/**
 * Lectura de la factura electrónica (UBL 2.1) que entrega un PROVEEDOR, para
 * precargar una compra. No emite nada ante la DIAN: solo lee el XML recibido.
 *
 * Admite el Invoice directo o el AttachedDocument de la DIAN, que trae el
 * Invoice embebido en cac:Attachment/cac:ExternalReference/cbc:Description.
 */

export interface LineaUbl {
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  pctDescuento: number;
  pctIva: number;
  totalLinea: number;
}

export interface FacturaUbl {
  numero: string | null;
  cufe: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  proveedor: { nit: string | null; razonSocial: string | null };
  moneda: string | null;
  lineas: LineaUbl[];
  totales: { base: number | null; iva: number | null; total: number | null };
}

const TAMANO_MAXIMO_XML = 5 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  // Sin entidades: evita XXE y expansión de entidades (billion laughs)
  processEntities: false,
  isArray: (nombre) => ['InvoiceLine', 'TaxSubtotal', 'AllowanceCharge', 'TaxTotal'].includes(nombre),
});

/** Valor de texto de un nodo que puede venir como string o como { '#text', '@_attr' }. */
function texto(nodo: any): string | null {
  if (nodo === undefined || nodo === null) return null;
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo).trim() || null;
  if (typeof nodo === 'object' && '#text' in nodo) return String(nodo['#text']).trim() || null;
  return null;
}

function numero(nodo: any): number | null {
  const t = texto(nodo);
  if (t === null) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const redondear = (v: number, d = 2) => Math.round((v + Number.EPSILON) * 10 ** d) / 10 ** d;

function extraerInvoice(raiz: any): any {
  if (raiz.Invoice) return raiz.Invoice;
  const adjunto = raiz.AttachedDocument;
  if (adjunto) {
    const descripcion = texto(adjunto?.Attachment?.ExternalReference?.Description);
    if (descripcion) {
      const interno = parser.parse(descripcion);
      if (interno.Invoice) return interno.Invoice;
    }
  }
  throw new UnprocessableEntityException('El XML no es una factura UBL (Invoice) ni un AttachedDocument con factura');
}

export function leerFacturaUbl(xml: string | Buffer): FacturaUbl {
  const contenido = Buffer.isBuffer(xml) ? xml.toString('utf8') : xml;
  if (Buffer.byteLength(contenido) > TAMANO_MAXIMO_XML) {
    throw new UnprocessableEntityException('El XML supera 5 MB');
  }
  if (/<!DOCTYPE/i.test(contenido)) {
    throw new UnprocessableEntityException('El XML no puede declarar DOCTYPE');
  }

  let raiz: any;
  try {
    raiz = parser.parse(contenido.replace(/^﻿/, ''));
  } catch {
    throw new UnprocessableEntityException('El archivo no es un XML válido');
  }
  const inv = extraerInvoice(raiz);

  const proveedorParty = inv.AccountingSupplierParty?.Party;
  const nit =
    texto(proveedorParty?.PartyTaxScheme?.CompanyID) || texto(proveedorParty?.PartyLegalEntity?.CompanyID);
  const razonSocial =
    texto(proveedorParty?.PartyTaxScheme?.RegistrationName) ||
    texto(proveedorParty?.PartyLegalEntity?.RegistrationName) ||
    texto(proveedorParty?.PartyName?.Name);

  const lineas: LineaUbl[] = (inv.InvoiceLine || []).map((l: any) => {
    const cantidad = numero(l.InvoicedQuantity) ?? 0;
    const totalLinea = numero(l.LineExtensionAmount) ?? 0;
    const precio = numero(l.Price?.PriceAmount) ?? (cantidad ? totalLinea / cantidad : 0);
    const bruto = cantidad * precio;

    // Descuentos de línea: AllowanceCharge con ChargeIndicator = false
    const descuento = (l.AllowanceCharge || [])
      .filter((a: any) => texto(a.ChargeIndicator) === 'false')
      .reduce((acc: number, a: any) => acc + (numero(a.Amount) ?? 0), 0);

    const subtotalesIva = (l.TaxTotal || [])
      .flatMap((t: any) => t.TaxSubtotal || [])
      .filter((s: any) => {
        const id = texto(s.TaxCategory?.TaxScheme?.ID);
        return !id || id === '01';
      });
    const pctIva = numero(subtotalesIva[0]?.TaxCategory?.Percent) ?? 0;

    return {
      codigo:
        texto(l.Item?.SellersItemIdentification?.ID) ||
        texto(l.Item?.StandardItemIdentification?.ID) ||
        null,
      descripcion: texto(l.Item?.Description) || texto(l.Item?.Name) || '',
      cantidad,
      costoUnitario: redondear(precio),
      pctDescuento: bruto > 0 ? redondear((descuento / bruto) * 100) : 0,
      pctIva,
      totalLinea,
    };
  });

  const totales = inv.LegalMonetaryTotal || {};
  const sumarIva = (taxTotals: any[]) =>
    taxTotals
      .flatMap((t: any) => t.TaxSubtotal || [])
      .filter((s: any) => (texto(s.TaxCategory?.TaxScheme?.ID) || '01') === '01')
      .reduce((acc: number, s: any) => acc + (numero(s.TaxAmount) ?? 0), 0);
  // IVA del documento; si no viene en el encabezado se suma el de las líneas
  const totalIva =
    sumarIva(inv.TaxTotal || []) || sumarIva((inv.InvoiceLine || []).flatMap((l: any) => l.TaxTotal || []));

  return {
    numero: texto(inv.ID),
    cufe: texto(inv.UUID),
    fechaEmision: texto(inv.IssueDate),
    fechaVencimiento: texto(inv.DueDate) || texto(inv.PaymentMeans?.PaymentDueDate),
    proveedor: { nit, razonSocial },
    moneda: texto(inv.DocumentCurrencyCode),
    lineas,
    totales: {
      base: numero(totales.LineExtensionAmount),
      iva: totalIva ? redondear(totalIva) : null,
      total: numero(totales.PayableAmount),
    },
  };
}

/** NIT sin dígito de verificación, puntos ni guiones (para comparar con terceros). */
export function normalizarNit(nit: string | null | undefined): string | null {
  if (!nit) return null;
  const limpio = nit.replace(/[.\s]/g, '');
  return limpio.split('-')[0] || null;
}
