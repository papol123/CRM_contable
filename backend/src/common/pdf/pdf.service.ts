import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import PDFDocument = require('pdfkit');
import { AlmacenamientoService } from '../almacenamiento/almacenamiento.service';

export interface DatosEmpresaPdf {
  razonSocial: string;
  nit: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo?: Buffer;
}

export interface LineaPdf {
  codigo: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  pctDescuento?: number;
  pctIva?: number;
  total: number;
}

export interface DocumentoPdf {
  titulo: string;
  numero: string;
  /** Pares etiqueta/valor bajo el encabezado (fecha, vencimiento, estado...) */
  campos: Array<[string, string]>;
  tercero?: { etiqueta: string; nombre: string; documento?: string; direccion?: string; telefono?: string; email?: string };
  lineas?: LineaPdf[];
  /** Tabla libre para documentos sin productos (p. ej. aplicaciones de un recibo) */
  tabla?: { columnas: string[]; anchos: number[]; filas: string[][]; alineacion?: Array<'left' | 'right'> };
  totales: Array<[string, number]>;
  notas?: string[];
  pie?: string;
}

export interface DesprendiblePdf {
  empleado: string;
  documento?: string;
  cargo?: string;
  diasTrabajados: number;
  devengados: Array<[string, number]>;
  deducciones: Array<[string, number]>;
  neto: number;
}

const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 });
const cantidadFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
export const formatoMoneda = (v: number) => moneda.format(Number(v || 0));

const MARGEN = 40;
const ANCHO_PAGINA = 595.28; // A4
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

/**
 * Generación de PDF de remisiones, cotizaciones, recibos de caja y
 * desprendibles de nómina. Los documentos se generan bajo demanda con los
 * datos vigentes de la empresa (tabla `empresa`) y su logo.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  async datosEmpresa(): Promise<DatosEmpresaPdf> {
    const [empresa] = await this.dataSource.query(
      `SELECT razon_social, nit, direccion, telefono, email FROM empresa ORDER BY fila LIMIT 1`,
    );
    const [logo] = await this.dataSource.query(
      `SELECT valor FROM configuracion_sistema WHERE clave = 'EMPRESA_LOGO_RUTA' AND valor <> ''`,
    );
    let logoBuffer: Buffer | undefined;
    if (logo?.valor) {
      try {
        logoBuffer = await this.almacenamiento.leer(logo.valor);
      } catch {
        this.logger.warn('No se pudo cargar el logo de la empresa; el PDF se genera sin logo');
      }
    }
    return {
      razonSocial: empresa?.razon_social || 'Empresa sin configurar',
      nit: empresa?.nit || '',
      direccion: empresa?.direccion,
      telefono: empresa?.telefono,
      email: empresa?.email,
      logo: logoBuffer,
    };
  }

  async documento(doc: DocumentoPdf): Promise<Buffer> {
    const empresa = await this.datosEmpresa();
    return this.renderizar((pdf) => {
      this.encabezado(pdf, empresa, doc.titulo, doc.numero);

      let y = pdf.y + 8;
      for (const [etiqueta, valor] of doc.campos) {
        pdf.font('Helvetica-Bold').fontSize(9).text(`${etiqueta}:`, MARGEN, y, { continued: true });
        pdf.font('Helvetica').text(` ${valor}`);
        y = pdf.y + 2;
      }

      if (doc.tercero) {
        const t = doc.tercero;
        y = pdf.y + 10;
        pdf.rect(MARGEN, y, ANCHO_UTIL, 58).strokeColor('#cccccc').stroke();
        pdf.font('Helvetica-Bold').fontSize(9).text(t.etiqueta, MARGEN + 8, y + 6);
        pdf.font('Helvetica').fontSize(9).text(t.nombre, MARGEN + 8, y + 18);
        const detalle = [
          t.documento && `Documento: ${t.documento}`,
          t.direccion && `Dirección: ${t.direccion}`,
          [t.telefono && `Tel: ${t.telefono}`, t.email].filter(Boolean).join('  ·  '),
        ].filter(Boolean);
        pdf.fontSize(8).fillColor('#444444').text(detalle.join('\n'), MARGEN + 8, y + 30);
        pdf.fillColor('black');
        pdf.y = y + 66;
      }

      if (doc.lineas?.length) {
        this.tabla(pdf, {
          columnas: ['Código', 'Descripción', 'Cant.', 'V. unitario', 'Desc.', 'IVA', 'Total'],
          anchos: [62, 165, 40, 72, 38, 38, 100],
          alineacion: ['left', 'left', 'right', 'right', 'right', 'right', 'right'],
          filas: doc.lineas.map((l) => [
            l.codigo,
            l.descripcion,
            cantidadFmt.format(l.cantidad),
            formatoMoneda(l.valorUnitario),
            `${Number(l.pctDescuento || 0)}%`,
            `${Number(l.pctIva || 0)}%`,
            formatoMoneda(l.total),
          ]),
        });
      }
      if (doc.tabla) this.tabla(pdf, doc.tabla);

      // Totales alineados a la derecha
      pdf.moveDown(0.5);
      for (const [i, [etiqueta, valor]] of doc.totales.entries()) {
        const esUltimo = i === doc.totales.length - 1;
        const yTotal = pdf.y;
        pdf.font(esUltimo ? 'Helvetica-Bold' : 'Helvetica').fontSize(esUltimo ? 11 : 9);
        pdf.text(etiqueta, MARGEN + ANCHO_UTIL - 260, yTotal, { width: 150, align: 'right' });
        pdf.text(formatoMoneda(valor), MARGEN + ANCHO_UTIL - 105, yTotal, { width: 105, align: 'right' });
        pdf.moveDown(0.2);
      }

      if (doc.notas?.length) {
        pdf.moveDown(1).font('Helvetica-Bold').fontSize(9).text('Observaciones', MARGEN);
        pdf.font('Helvetica').fontSize(8).text(doc.notas.join('\n'), MARGEN, pdf.y, { width: ANCHO_UTIL });
      }
      if (doc.pie) {
        pdf.moveDown(1.5).font('Helvetica-Oblique').fontSize(7.5).fillColor('#555555');
        pdf.text(doc.pie, MARGEN, pdf.y, { width: ANCHO_UTIL, align: 'center' });
        pdf.fillColor('black');
      }
    });
  }

  async desprendibles(periodo: string, items: DesprendiblePdf[]): Promise<Buffer> {
    const empresa = await this.datosEmpresa();
    return this.renderizar((pdf) => {
      items.forEach((d, i) => {
        if (i > 0) pdf.addPage();
        this.encabezado(pdf, empresa, 'Desprendible de nómina', periodo);
        pdf.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text(d.empleado, MARGEN);
        pdf.font('Helvetica').fontSize(9).text(
          [d.documento && `Documento: ${d.documento}`, d.cargo && `Cargo: ${d.cargo}`, `Días trabajados: ${d.diasTrabajados}`]
            .filter(Boolean)
            .join('   ·   '),
        );
        pdf.moveDown(0.8);
        const filas = [
          ...d.devengados.map(([c, v]) => ['Devengado', c, formatoMoneda(v)]),
          ...d.deducciones.map(([c, v]) => ['Deducción', c, `-${formatoMoneda(v)}`]),
        ];
        this.tabla(pdf, {
          columnas: ['Tipo', 'Concepto', 'Valor'],
          anchos: [100, 285, 130],
          alineacion: ['left', 'left', 'right'],
          filas,
        });
        pdf.moveDown(0.5).font('Helvetica-Bold').fontSize(11);
        pdf.text(`Neto a pagar: ${formatoMoneda(d.neto)}`, MARGEN, pdf.y, { width: ANCHO_UTIL, align: 'right' });
      });
    });
  }

  private renderizar(dibujar: (pdf: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });
      const partes: Buffer[] = [];
      pdf.on('data', (p: Buffer) => partes.push(p));
      pdf.on('end', () => resolve(Buffer.concat(partes)));
      pdf.on('error', reject);
      try {
        dibujar(pdf);
        const paginas = pdf.bufferedPageRange();
        for (let i = 0; i < paginas.count; i++) {
          pdf.switchToPage(i);
          pdf.font('Helvetica').fontSize(7).fillColor('#888888');
          pdf.text(`Página ${i + 1} de ${paginas.count}`, MARGEN, 841.89 - 30, {
            width: ANCHO_UTIL,
            align: 'right',
            lineBreak: false,
          });
          pdf.fillColor('black');
        }
        pdf.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private encabezado(pdf: PDFKit.PDFDocument, empresa: DatosEmpresaPdf, titulo: string, numero: string) {
    const yInicio = MARGEN;
    let xTexto = MARGEN;
    if (empresa.logo) {
      try {
        pdf.image(empresa.logo, MARGEN, yInicio, { fit: [70, 50] });
        xTexto = MARGEN + 80;
      } catch {
        // Logo en un formato que pdfkit no soporta (p. ej. webp): se omite
      }
    }
    pdf.font('Helvetica-Bold').fontSize(12).text(empresa.razonSocial, xTexto, yInicio, { width: 260 });
    pdf.font('Helvetica').fontSize(8).fillColor('#444444');
    pdf.text(
      [empresa.nit && `NIT ${empresa.nit}`, empresa.direccion, [empresa.telefono, empresa.email].filter(Boolean).join(' · ')]
        .filter(Boolean)
        .join('\n'),
      xTexto,
      pdf.y + 2,
      { width: 260 },
    );
    pdf.fillColor('black');

    pdf.font('Helvetica-Bold').fontSize(14).text(titulo.toUpperCase(), MARGEN + ANCHO_UTIL - 200, yInicio, {
      width: 200,
      align: 'right',
    });
    pdf.font('Helvetica').fontSize(11).text(numero, MARGEN + ANCHO_UTIL - 200, pdf.y + 2, { width: 200, align: 'right' });

    pdf.y = Math.max(pdf.y, yInicio + 60);
    pdf.moveTo(MARGEN, pdf.y).lineTo(MARGEN + ANCHO_UTIL, pdf.y).strokeColor('#999999').stroke();
    pdf.strokeColor('black');
    pdf.x = MARGEN;
  }

  private tabla(
    pdf: PDFKit.PDFDocument,
    t: { columnas: string[]; anchos: number[]; filas: string[][]; alineacion?: Array<'left' | 'right'> },
  ) {
    const alto = 16;
    const dibujarEncabezado = () => {
      const y = pdf.y + 6;
      pdf.rect(MARGEN, y, ANCHO_UTIL, alto).fill('#eeeeee').fillColor('black');
      let x = MARGEN;
      pdf.font('Helvetica-Bold').fontSize(8);
      t.columnas.forEach((c, i) => {
        pdf.text(c, x + 3, y + 4, { width: t.anchos[i] - 6, align: t.alineacion?.[i] || 'left', lineBreak: false });
        x += t.anchos[i];
      });
      pdf.y = y + alto;
    };

    dibujarEncabezado();
    pdf.font('Helvetica').fontSize(8);
    for (const fila of t.filas) {
      const altoFila = Math.max(
        alto,
        ...fila.map((celda, i) => pdf.heightOfString(celda, { width: t.anchos[i] - 6 }) + 6),
      );
      if (pdf.y + altoFila > 841.89 - 60) {
        pdf.addPage();
        dibujarEncabezado();
        pdf.font('Helvetica').fontSize(8);
      }
      const y = pdf.y;
      let x = MARGEN;
      fila.forEach((celda, i) => {
        pdf.text(celda, x + 3, y + 3, { width: t.anchos[i] - 6, align: t.alineacion?.[i] || 'left' });
        x += t.anchos[i];
      });
      pdf.moveTo(MARGEN, y + altoFila).lineTo(MARGEN + ANCHO_UTIL, y + altoFila).strokeColor('#e0e0e0').stroke();
      pdf.strokeColor('black');
      pdf.y = y + altoFila;
    }
    pdf.x = MARGEN;
  }
}
