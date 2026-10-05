import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AlmacenamientoService,
  TAMANO_MAXIMO_ADJUNTO,
  TIPOS_ADJUNTO_PERMITIDOS,
} from '../almacenamiento/almacenamiento.service';

export interface ArchivoSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Firmas (magic bytes) para no confiar solo en el Content-Type que envía el cliente. */
function contenidoCoincide(tipoMime: string, buffer: Buffer): boolean {
  const inicio = buffer.subarray(0, 16);
  switch (tipoMime) {
    case 'application/pdf':
      return inicio.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'image/png':
      return inicio.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff;
    case 'image/webp':
      return inicio.subarray(0, 4).toString('latin1') === 'RIFF' && inicio.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'application/xml':
    case 'text/xml':
      return buffer.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart().startsWith('<');
    default:
      return false;
  }
}

export function validarArchivo(archivo: ArchivoSubido | undefined, tiposPermitidos = Object.keys(TIPOS_ADJUNTO_PERMITIDOS)) {
  if (!archivo || !archivo.buffer?.length) {
    throw new BadRequestException('Adjunte el archivo en el campo "archivo" (multipart/form-data)');
  }
  if (archivo.size > TAMANO_MAXIMO_ADJUNTO) {
    throw new PayloadTooLargeException(`El archivo supera ${TAMANO_MAXIMO_ADJUNTO / 1024 / 1024} MB`);
  }
  if (!tiposPermitidos.includes(archivo.mimetype) || !contenidoCoincide(archivo.mimetype, archivo.buffer)) {
    throw new UnsupportedMediaTypeException(`Tipo de archivo no permitido. Se aceptan: ${tiposPermitidos.join(', ')}`);
  }
}

/** Adjuntos de documentos (PDF/XML de compras, soportes de gastos, PDFs enviados). */
@Injectable()
export class AdjuntosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  async guardar(tabla: string, idRegistro: string, archivo: ArchivoSubido, tiposPermitidos?: string[]) {
    validarArchivo(archivo, tiposPermitidos);
    const extension = TIPOS_ADJUNTO_PERMITIDOS[archivo.mimetype] || '';
    const ruta = this.almacenamiento.generarRuta(tabla, extension);
    await this.almacenamiento.guardar(ruta, archivo.buffer, archivo.mimetype);
    const nombre = archivo.originalname.replace(/[\\/\r\n"]/g, '_').slice(0, 255) || `archivo${extension}`;

    const [fila] = await this.dataSource.query(
      `INSERT INTO adjuntos_documento (tabla, id_registro, nombre_archivo, url, tipo_mime, tamano_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_adjunto AS "id", nombre_archivo AS "nombreArchivo", tipo_mime AS "tipoMime",
                 tamano_bytes AS "tamanoBytes", subido_en AS "subidoEn"`,
      [tabla, idRegistro, nombre, ruta, archivo.mimetype, archivo.size],
    );
    return { ...fila, tamanoBytes: Number(fila.tamanoBytes) };
  }

  async listar(tabla: string, idRegistro: string, rutaBase: string) {
    const filas = await this.dataSource.query(
      `SELECT id_adjunto AS "id", nombre_archivo AS "nombreArchivo", tipo_mime AS "tipoMime",
              tamano_bytes AS "tamanoBytes", subido_en AS "subidoEn"
         FROM adjuntos_documento
        WHERE tabla = $1 AND id_registro = $2
        ORDER BY subido_en DESC`,
      [tabla, idRegistro],
    );
    return filas.map((f: any) => ({
      ...f,
      tamanoBytes: Number(f.tamanoBytes),
      urlDescarga: `${rutaBase}/${f.id}`,
    }));
  }

  /** Lee el archivo verificando que pertenezca al documento indicado. */
  async leer(tabla: string, idRegistro: string, idAdjunto: string) {
    const [fila] = await this.dataSource.query(
      `SELECT nombre_archivo, url, tipo_mime FROM adjuntos_documento
        WHERE id_adjunto = $1 AND tabla = $2 AND id_registro = $3`,
      [idAdjunto, tabla, idRegistro],
    );
    if (!fila) throw new NotFoundException('Adjunto no encontrado');
    return {
      contenido: await this.almacenamiento.leer(fila.url),
      nombre: fila.nombre_archivo as string,
      tipoMime: (fila.tipo_mime as string) || 'application/octet-stream',
    };
  }
}
