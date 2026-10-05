import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/** Tipos de archivo aceptados como adjuntos o soportes. */
export const TIPOS_ADJUNTO_PERMITIDOS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/xml': '.xml',
  'text/xml': '.xml',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
export const TIPOS_IMAGEN_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
export const TAMANO_MAXIMO_ADJUNTO = 10 * 1024 * 1024;

export interface ArchivoGuardado {
  ruta: string;
  tamanoBytes: number;
  tipoMime: string;
}

/**
 * Almacenamiento de archivos (GEMINI.md §2: Cloud Storage para adjuntos y PDFs).
 *
 *  - `gcs`: Google Cloud Storage con credenciales por defecto de la aplicación
 *    (cuenta de servicio de Cloud Run o GOOGLE_APPLICATION_CREDENTIALS).
 *    Las descargas se entregan con URL firmadas de corta duración.
 *  - `local`: carpeta en disco para desarrollo. Las descargas pasan por la API.
 *
 * Las rutas siempre las genera el servidor; el nombre original del archivo
 * solo se guarda como metadato.
 */
@Injectable()
export class AlmacenamientoService {
  private readonly logger = new Logger(AlmacenamientoService.name);
  readonly driver: 'gcs' | 'local';
  readonly bucket: string | null;
  private readonly directorioLocal: string;
  private clienteGcs: any;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('GCP_STORAGE_BUCKET_NAME') || config.get<string>('GCP_STORAGE_BUCKET');
    const bucketValido = !!bucket && !bucket.startsWith('tu-');
    const driver = config.get<string>('STORAGE_DRIVER');
    this.driver = driver === 'gcs' || (!driver && bucketValido) ? 'gcs' : 'local';
    this.bucket = this.driver === 'gcs' ? bucket! : null;
    this.directorioLocal = path.resolve(config.get<string>('STORAGE_LOCAL_DIR') || path.join(process.cwd(), 'uploads'));
  }

  private gcs() {
    if (!this.clienteGcs) {
      // Carga diferida: en modo local no se necesita el SDK ni credenciales
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Storage } = require('@google-cloud/storage');
      this.clienteGcs = new Storage().bucket(this.bucket);
    }
    return this.clienteGcs;
  }

  /** Genera una ruta única dentro de la carpeta lógica indicada. */
  generarRuta(carpeta: string, extension: string): string {
    const limpia = carpeta.replace(/[^a-z0-9_\-/]/gi, '').replace(/^\/+|\/+$/g, '');
    const fecha = new Date().toISOString().slice(0, 7);
    return `${limpia}/${fecha}/${randomUUID()}${extension}`;
  }

  async guardar(ruta: string, contenido: Buffer, tipoMime: string): Promise<ArchivoGuardado> {
    try {
      if (this.driver === 'gcs') {
        await this.gcs().file(ruta).save(contenido, { contentType: tipoMime, resumable: false });
      } else {
        const destino = this.rutaLocal(ruta);
        await fs.mkdir(path.dirname(destino), { recursive: true });
        await fs.writeFile(destino, contenido);
      }
    } catch (err: any) {
      this.logger.error(`No se pudo guardar ${ruta}: ${err.message}`);
      throw new ServiceUnavailableException('El almacenamiento de archivos no está disponible');
    }
    return { ruta, tamanoBytes: contenido.length, tipoMime };
  }

  async leer(ruta: string): Promise<Buffer> {
    try {
      if (this.driver === 'gcs') {
        const [contenido] = await this.gcs().file(ruta).download();
        return contenido;
      }
      return await fs.readFile(this.rutaLocal(ruta));
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.code === 404) throw new NotFoundException('El archivo no existe');
      throw new ServiceUnavailableException('El almacenamiento de archivos no está disponible');
    }
  }

  /** URL firmada de lectura (solo GCS). En modo local devuelve null y la descarga pasa por la API. */
  async urlFirmada(ruta: string, minutos = 15, nombreDescarga?: string): Promise<string | null> {
    if (this.driver !== 'gcs') return null;
    const [url] = await this.gcs()
      .file(ruta)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + minutos * 60 * 1000,
        ...(nombreDescarga
          ? { responseDisposition: `attachment; filename="${nombreDescarga.replace(/"/g, '')}"` }
          : {}),
      });
    return url;
  }

  async eliminar(ruta: string): Promise<void> {
    try {
      if (this.driver === 'gcs') await this.gcs().file(ruta).delete({ ignoreNotFound: true });
      else await fs.rm(this.rutaLocal(ruta), { force: true });
    } catch (err: any) {
      this.logger.warn(`No se pudo eliminar ${ruta}: ${err.message}`);
    }
  }

  /** Readiness: el bucket (o la carpeta local) es accesible. */
  async verificar(): Promise<{ status: 'up' | 'down'; driver: string; destino: string; error?: string }> {
    const destino = this.driver === 'gcs' ? `gs://${this.bucket}` : this.directorioLocal;
    try {
      if (this.driver === 'gcs') {
        // Listar un objeto basta con roles/storage.objectAdmin (consultar el bucket exigiría más permisos)
        await this.gcs().getFiles({ maxResults: 1, autoPaginate: false });
      } else {
        await fs.mkdir(this.directorioLocal, { recursive: true });
        await fs.access(this.directorioLocal);
      }
      return { status: 'up', driver: this.driver, destino };
    } catch (err: any) {
      return { status: 'down', driver: this.driver, destino, error: err.message };
    }
  }

  /** Evita que una ruta manipulada salga de la carpeta local. */
  private rutaLocal(ruta: string): string {
    const destino = path.resolve(this.directorioLocal, ruta);
    if (!destino.startsWith(this.directorioLocal + path.sep)) {
      throw new NotFoundException('El archivo no existe');
    }
    return destino;
  }
}
