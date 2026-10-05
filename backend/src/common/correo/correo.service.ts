import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as nodemailer from 'nodemailer';

export interface Correo {
  para: string | string[];
  asunto: string;
  texto: string;
  html?: string;
  adjuntos?: Array<{ nombre: string; contenido: Buffer; tipoMime?: string }>;
}

export interface ConfiguracionSmtp {
  host: string;
  puerto: number;
  ssl: boolean;
  usuario: string;
  remitente: string;
}

/**
 * Envío de correo por SMTP.
 *
 * Host, puerto, usuario y remitente se administran con PATCH /configuracion/correo.
 * La contraseña NUNCA se guarda en base de datos: se lee de SMTP_PASSWORD,
 * que en GCP se monta desde Secret Manager.
 *
 * En desarrollo, CORREO_MODO=log escribe el correo en la consola en lugar de enviarlo.
 */
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get modoLog(): boolean {
    return this.config.get('CORREO_MODO') === 'log' && this.config.get('NODE_ENV') !== 'production';
  }

  async configuracion(): Promise<ConfiguracionSmtp> {
    const filas: Array<{ clave: string; valor: string }> = await this.dataSource.query(
      `SELECT clave, valor FROM configuracion_sistema WHERE categoria = 'CORREO'`,
    );
    const v = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    return {
      host: v.CORREO_HOST || '',
      puerto: Number(v.CORREO_PUERTO || 587),
      ssl: v.CORREO_SSL === 'true',
      usuario: v.CORREO_USUARIO || '',
      remitente: v.CORREO_REMITENTE || '',
    };
  }

  /** true si hay servidor, remitente y (cuando hay usuario) contraseña. */
  async disponible(): Promise<boolean> {
    if (this.modoLog) return true;
    const c = await this.configuracion();
    return !!c.host && !!c.remitente && (!c.usuario || !!this.config.get('SMTP_PASSWORD'));
  }

  async enviar(correo: Correo): Promise<void> {
    if (this.modoLog) {
      this.logger.log(
        `[CORREO_MODO=log] Para: ${[correo.para].flat().join(', ')} | Asunto: ${correo.asunto}\n${correo.texto}` +
          (correo.adjuntos?.length ? `\nAdjuntos: ${correo.adjuntos.map((a) => a.nombre).join(', ')}` : ''),
      );
      return;
    }

    const c = await this.configuracion();
    const password = this.config.get<string>('SMTP_PASSWORD');
    if (!c.host || !c.remitente || (c.usuario && !password)) {
      throw new ServiceUnavailableException(
        'El correo no está configurado: defina host y remitente en /configuracion/correo y SMTP_PASSWORD en Secret Manager',
      );
    }

    const transporte = nodemailer.createTransport({
      host: c.host,
      port: c.puerto,
      secure: c.ssl,
      auth: c.usuario ? { user: c.usuario, pass: password } : undefined,
      connectionTimeout: 15000,
    });

    try {
      await transporte.sendMail({
        from: c.remitente,
        to: correo.para,
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
        attachments: correo.adjuntos?.map((a) => ({
          filename: a.nombre,
          content: a.contenido,
          contentType: a.tipoMime,
        })),
      });
    } catch (err: any) {
      this.logger.error(`Fallo el envío de correo a ${[correo.para].flat().join(', ')}: ${err.message}`);
      throw new ServiceUnavailableException('El servidor de correo no respondió. Intente más tarde');
    }
  }
}
