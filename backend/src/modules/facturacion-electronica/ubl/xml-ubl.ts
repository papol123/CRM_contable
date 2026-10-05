/**
 * Documento de factura en el formato que necesitan la DIAN o un proveedor
 * tecnológico, y su representación UBL 2.1 SIN FIRMA.
 *
 * El XML resultante sirve como vista previa y como insumo para un proveedor:
 * no incluye la firma XAdES ni el SoftwareSecurityCode, que dependen del
 * certificado digital y del software registrado ante la DIAN.
 */

export interface ParteDocumento {
  tipoDocumento: string; // código DIAN (31 NIT, 13 CC…)
  numeroDocumento: string; // sin DV
  dv: number;
  razonSocial: string;
  tipoPersona: 'NATURAL' | 'JURIDICA';
  responsabilidadesFiscales: string; // 'O-13;O-15' o 'R-99-PN'
  responsableIva: boolean;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  telefono?: string;
  email?: string;
}

export interface LineaDocumento {
  numero: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  descuento: number; // valor, no porcentaje
  baseGravable: number; // cantidad * valor unitario - descuento
  pctIva: number;
  valorIva: number;
}

export interface ImpuestoDocumento {
  porcentaje: number;
  base: number;
  valor: number;
}

export interface DocumentoElectronico {
  numero: string; // prefijo + consecutivo sin guion (p. ej. FAC000123)
  prefijo: string;
  fechaEmision: string;
  horaEmision: string;
  fechaVencimiento: string;
  formaPago: 'CONTADO' | 'CREDITO';
  tipoAmbiente: '1' | '2';
  resolucion?: {
    numero: string;
    fechaExpedicion: string;
    vigenteHasta?: string;
    rangoDesde: number;
    rangoHasta: number;
  };
  emisor: ParteDocumento;
  adquiriente: ParteDocumento;
  lineas: LineaDocumento[];
  impuestos: ImpuestoDocumento[];
  totales: {
    valorBruto: number; // suma de bases gravables (LineExtensionAmount)
    totalImpuestos: number;
    totalConImpuestos: number; // TaxInclusiveAmount = PayableAmount
    retefuente: number; // informativa: no reduce el valor a pagar en UBL
  };
  cufe: string | null;
  observaciones?: string;
}

const esc = (valor: unknown) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const monto = (valor: number) => `currencyID="COP">${valor.toFixed(2)}`;

function parte(p: ParteDocumento, etiqueta: 'AccountingSupplierParty' | 'AccountingCustomerParty') {
  const tipoOrganizacion = p.tipoPersona === 'JURIDICA' ? '1' : '2';
  const esquemaImpuesto = p.responsableIva
    ? '<cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name>'
    : '<cbc:ID>ZZ</cbc:ID><cbc:Name>No aplica</cbc:Name>';
  const dvAttr = p.tipoDocumento === '31' ? ` schemeID="${p.dv}"` : '';
  return `
  <cac:${etiqueta}>
    <cbc:AdditionalAccountID>${tipoOrganizacion}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(p.razonSocial)}</cbc:Name></cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:CityName>${esc(p.ciudad)}</cbc:CityName>
          <cbc:CountrySubentity>${esc(p.departamento)}</cbc:CountrySubentity>
          <cac:AddressLine><cbc:Line>${esc(p.direccion)}</cbc:Line></cac:AddressLine>
          <cac:Country><cbc:IdentificationCode>CO</cbc:IdentificationCode></cac:Country>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${esc(p.razonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195"${dvAttr} schemeName="${p.tipoDocumento}">${esc(p.numeroDocumento)}</cbc:CompanyID>
        <cbc:TaxLevelCode>${esc(p.responsabilidadesFiscales)}</cbc:TaxLevelCode>
        <cac:TaxScheme>${esquemaImpuesto}</cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>${esc(p.telefono)}</cbc:Telephone>
        <cbc:ElectronicMail>${esc(p.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:${etiqueta}>`;
}

export function generarXmlUbl(doc: DocumentoElectronico): string {
  const resolucion = doc.resolucion
    ? `
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${esc(doc.resolucion.numero)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${esc(doc.resolucion.fechaExpedicion)}</cbc:StartDate>
              <cbc:EndDate>${esc(doc.resolucion.vigenteHasta)}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${esc(doc.prefijo)}</sts:Prefix>
              <sts:From>${doc.resolucion.rangoDesde}</sts:From>
              <sts:To>${doc.resolucion.rangoHasta}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <!-- SoftwareProvider, SoftwareSecurityCode y QRCode los completa el firmante -->
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
    <!-- Aquí va la firma XAdES-EPES (ds:Signature) del certificado digital -->
  </ext:UBLExtensions>`
    : '';

  const impuestos = doc.impuestos
    .map(
      (i) => `
  <cac:TaxTotal>
    <cbc:TaxAmount ${monto(i.valor)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount ${monto(i.base)}</cbc:TaxableAmount>
      <cbc:TaxAmount ${monto(i.valor)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${i.porcentaje.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`,
    )
    .join('');

  const retencion =
    doc.totales.retefuente > 0
      ? `
  <cac:WithholdingTaxTotal>
    <cbc:TaxAmount ${monto(doc.totales.retefuente)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount ${monto(doc.totales.valorBruto)}</cbc:TaxableAmount>
      <cbc:TaxAmount ${monto(doc.totales.retefuente)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme><cbc:ID>06</cbc:ID><cbc:Name>ReteRenta</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:WithholdingTaxTotal>`
      : '';

  const lineas = doc.lineas
    .map(
      (l) => `
  <cac:InvoiceLine>
    <cbc:ID>${l.numero}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">${l.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount ${monto(l.baseGravable)}</cbc:LineExtensionAmount>${
      l.descuento > 0
        ? `
    <cac:AllowanceCharge>
      <cbc:ID>1</cbc:ID>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:Amount ${monto(l.descuento)}</cbc:Amount>
      <cbc:BaseAmount ${monto(l.cantidad * l.valorUnitario)}</cbc:BaseAmount>
    </cac:AllowanceCharge>`
        : ''
    }
    <cac:TaxTotal>
      <cbc:TaxAmount ${monto(l.valorIva)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount ${monto(l.baseGravable)}</cbc:TaxableAmount>
        <cbc:TaxAmount ${monto(l.valorIva)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${l.pctIva.toFixed(2)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${esc(l.descripcion)}</cbc:Description>
      <cac:StandardItemIdentification><cbc:ID schemeID="999">${esc(l.codigo)}</cbc:ID></cac:StandardItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount ${monto(l.valorUnitario)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="94">1</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Vista previa UBL 2.1 SIN FIRMA generada por CRM Contable. No es válida ante la DIAN hasta ser firmada y validada. -->
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1">${resolucion}
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>
  <cbc:ProfileExecutionID>${doc.tipoAmbiente}</cbc:ProfileExecutionID>
  <cbc:ID>${esc(doc.numero)}</cbc:ID>
  <cbc:UUID schemeID="${doc.tipoAmbiente}" schemeName="CUFE-SHA384">${esc(doc.cufe ?? '')}</cbc:UUID>
  <cbc:IssueDate>${doc.fechaEmision}</cbc:IssueDate>
  <cbc:IssueTime>${doc.horaEmision}</cbc:IssueTime>
  <cbc:DueDate>${doc.fechaVencimiento}</cbc:DueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>${doc.observaciones ? `
  <cbc:Note>${esc(doc.observaciones)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${doc.lineas.length}</cbc:LineCountNumeric>${parte(doc.emisor, 'AccountingSupplierParty')}${parte(doc.adquiriente, 'AccountingCustomerParty')}
  <cac:PaymentMeans>
    <cbc:ID>${doc.formaPago === 'CONTADO' ? '1' : '2'}</cbc:ID>
    <cbc:PaymentMeansCode>ZZZ</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${doc.fechaVencimiento}</cbc:PaymentDueDate>
  </cac:PaymentMeans>${impuestos}${retencion}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${monto(doc.totales.valorBruto)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${monto(doc.totales.valorBruto)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${monto(doc.totales.totalConImpuestos)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount ${monto(doc.totales.totalConImpuestos)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineas}
</Invoice>
`;
}
