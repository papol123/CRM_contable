import { leerFacturaUbl, normalizarNit } from './ubl-proveedor';

const invoice = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>SETP990000002</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">cufe-123</cbc:UUID>
  <cbc:IssueDate>2026-09-10</cbc:IssueDate>
  <cbc:DueDate>2026-10-10</cbc:DueDate>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme>
    <cbc:RegistrationName>Proveedor SAS</cbc:RegistrationName>
    <cbc:CompanyID schemeID="7">900.123.456-7</cbc:CompanyID>
  </cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">4</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">36000.00</cbc:LineExtensionAmount>
    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="COP">4000.00</cbc:Amount></cac:AllowanceCharge>
    <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount currencyID="COP">6840.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:Percent>19.00</cbc:Percent><cac:TaxScheme><cbc:ID>01</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Description>Filtro de aceite</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>FIL-001</cbc:ID></cac:SellersItemIdentification></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="COP">10000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount>36000.00</cbc:LineExtensionAmount><cbc:PayableAmount>42840.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`;

describe('lectura de factura UBL del proveedor', () => {
  it('extrae encabezado, proveedor, líneas con descuento e IVA y totales', () => {
    const f = leerFacturaUbl(invoice);
    expect(f.numero).toBe('SETP990000002');
    expect(f.cufe).toBe('cufe-123');
    expect(f.fechaEmision).toBe('2026-09-10');
    expect(f.fechaVencimiento).toBe('2026-10-10');
    expect(f.proveedor).toEqual({ nit: '900.123.456-7', razonSocial: 'Proveedor SAS' });
    expect(f.lineas).toEqual([
      {
        codigo: 'FIL-001',
        descripcion: 'Filtro de aceite',
        cantidad: 4,
        costoUnitario: 10000,
        pctDescuento: 10,
        pctIva: 19,
        totalLinea: 36000,
      },
    ]);
    expect(f.totales).toEqual({ base: 36000, iva: 6840, total: 42840 });
  });

  it('lee la factura embebida en un AttachedDocument de la DIAN', () => {
    const adjunto = `<AttachedDocument xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
      <cac:Attachment><cac:ExternalReference><cbc:Description><![CDATA[${invoice}]]></cbc:Description></cac:ExternalReference></cac:Attachment>
    </AttachedDocument>`;
    expect(leerFacturaUbl(adjunto).numero).toBe('SETP990000002');
  });

  it('rechaza XML con DOCTYPE (XXE) y documentos que no son facturas', () => {
    expect(() => leerFacturaUbl('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Invoice>&e;</Invoice>')).toThrow(
      /DOCTYPE/,
    );
    expect(() => leerFacturaUbl('<Pedido><ID>1</ID></Pedido>')).toThrow(/no es una factura/);
    expect(() => leerFacturaUbl('esto no es xml <<<')).toThrow();
  });

  it('normaliza el NIT sin puntos ni dígito de verificación', () => {
    expect(normalizarNit('900.123.456-7')).toBe('900123456');
    expect(normalizarNit('900123456')).toBe('900123456');
    expect(normalizarNit(null)).toBeNull();
  });
});
