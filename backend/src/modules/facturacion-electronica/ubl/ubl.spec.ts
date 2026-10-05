import { createHash } from 'crypto';
import { digitoVerificacion, separarNit, codigoTipoDocumento } from './identificacion';
import { calcularCufe, DatosCufe } from './cufe';
import { generarXmlUbl, DocumentoElectronico } from './xml-ubl';

describe('Identificación DIAN', () => {
  it('calcula el dígito de verificación de NIT conocidos', () => {
    expect(digitoVerificacion('800197268')).toBe(4); // DIAN
    expect(digitoVerificacion('899999068')).toBe(1); // Ecopetrol
  });

  it('separa NIT con guion e ignora el DV escrito', () => {
    expect(separarNit('800197268-4')).toEqual({ numero: '800197268', dv: 4 });
    expect(separarNit('800.197.268')).toEqual({ numero: '800197268', dv: 4 });
  });

  it('traduce tipos de documento a códigos DIAN', () => {
    expect(codigoTipoDocumento('NIT')).toBe('31');
    expect(codigoTipoDocumento('CC')).toBe('13');
    expect(codigoTipoDocumento('DESCONOCIDO')).toBe('13');
  });
});

describe('CUFE', () => {
  const datos: DatosCufe = {
    numeroFactura: 'FAC123',
    fechaEmision: '2026-09-27',
    horaEmision: '10:15:00-05:00',
    valorBruto: 200000,
    valorIva: 38000,
    valorInc: 0,
    valorIca: 0,
    valorTotal: 238000,
    nitEmisor: '900123456',
    documentoAdquiriente: '1018456789',
    claveTecnica: 'clave-de-prueba',
    tipoAmbiente: '2',
  };

  it('es el SHA-384 de la concatenación del anexo técnico con dos decimales', () => {
    const esperado = createHash('sha384')
      .update(
        'FAC1232026-09-2710:15:00-05:00200000.000138000.00040.00030.00238000.009001234561018456789clave-de-prueba2',
      )
      .digest('hex');
    expect(calcularCufe(datos)).toBe(esperado);
    expect(calcularCufe(datos)).toHaveLength(96);
  });

  it('cambia si cambia cualquier dato', () => {
    expect(calcularCufe({ ...datos, valorTotal: 238000.01 })).not.toBe(calcularCufe(datos));
    expect(calcularCufe({ ...datos, tipoAmbiente: '1' })).not.toBe(calcularCufe(datos));
  });
});

describe('XML UBL', () => {
  const parte = {
    tipoDocumento: '31',
    numeroDocumento: '900123456',
    dv: 8,
    razonSocial: 'Repuestos & Cía <SAS>',
    tipoPersona: 'JURIDICA' as const,
    responsabilidadesFiscales: 'O-13',
    responsableIva: true,
  };
  const doc: DocumentoElectronico = {
    numero: 'FAC123',
    prefijo: 'FAC',
    fechaEmision: '2026-09-27',
    horaEmision: '10:15:00-05:00',
    fechaVencimiento: '2026-10-27',
    formaPago: 'CREDITO',
    tipoAmbiente: '2',
    resolucion: { numero: '18764000001234', fechaExpedicion: '2026-01-01', vigenteHasta: '2027-12-31', rangoDesde: 1, rangoHasta: 10000 },
    emisor: parte,
    adquiriente: { ...parte, tipoDocumento: '13', razonSocial: 'Juan Pérez', tipoPersona: 'NATURAL', responsabilidadesFiscales: 'R-99-PN', responsableIva: false },
    lineas: [
      { numero: 1, codigo: 'REP-1', descripcion: 'Pastillas', cantidad: 2, valorUnitario: 100000, descuento: 0, baseGravable: 200000, pctIva: 19, valorIva: 38000 },
    ],
    impuestos: [{ porcentaje: 19, base: 200000, valor: 38000 }],
    totales: { valorBruto: 200000, totalImpuestos: 38000, totalConImpuestos: 238000, retefuente: 0 },
    cufe: 'abc',
  };

  it('incluye los nodos principales y los totales', () => {
    const xml = generarXmlUbl(doc);
    expect(xml).toContain('<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>');
    expect(xml).toContain('<cbc:ID>FAC123</cbc:ID>');
    expect(xml).toContain('schemeName="CUFE-SHA384">abc</cbc:UUID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="COP">238000.00</cbc:PayableAmount>');
    expect(xml).toContain('<sts:InvoiceAuthorization>18764000001234</sts:InvoiceAuthorization>');
    expect(xml).toContain('<cbc:PaymentMeansCode>ZZZ</cbc:PaymentMeansCode>');
  });

  it('escapa caracteres especiales', () => {
    const xml = generarXmlUbl(doc);
    expect(xml).toContain('Repuestos &amp; Cía &lt;SAS&gt;');
    expect(xml).not.toContain('<SAS>');
  });

  it('solo el NIT lleva DV en schemeID', () => {
    const xml = generarXmlUbl(doc);
    expect(xml).toContain('schemeID="8" schemeName="31">900123456</cbc:CompanyID>');
    expect(xml).toContain('schemeAgencyID="195" schemeName="13">900123456</cbc:CompanyID>');
  });
});
