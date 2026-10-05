import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CorreoService } from '../../common/correo/correo.service';

export type TipoTokenUsuario = 'RESET_PASSWORD' | 'INVITACION';

const VIGENCIA_HORAS: Record<TipoTokenUsuario, number> = {
  RESET_PASSWORD: 1,
  INVITACION: 72,
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Tokens de un solo uso para recuperar la contraseña o activar una cuenta
 * invitada. En base de datos solo se guarda el hash SHA-256 del token.
 */
@Injectable()
export class TokensUsuarioService {
  private readonly logger = new Logger(TokensUsuarioService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly correo: CorreoService,
    private readonly config: ConfigService,
  ) {}

  /** Crea un token nuevo e invalida los anteriores del mismo tipo. Devuelve el token en claro. */
  async emitir(idUsuario: string, tipo: TipoTokenUsuario, db: EntityManager = this.dataSource.manager): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `UPDATE tokens_usuario SET usado_en = now()
        WHERE id_usuario = $1 AND tipo = $2 AND usado_en IS NULL`,
      [idUsuario, tipo],
    );
    await db.query(
      `INSERT INTO tokens_usuario (id_usuario, tipo, token_hash, expira_en)
       VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
      [idUsuario, tipo, hashToken(token), VIGENCIA_HORAS[tipo]],
    );
    return token;
  }

  /**
   * Marca el token como usado y devuelve el usuario dueño, o null si el token
   * no existe, expiró o ya se usó. El UPDATE condicional evita el doble uso.
   */
  async consumir(token: string, db: EntityManager): Promise<{ idUsuario: string; tipo: TipoTokenUsuario } | null> {
    const [filas] = await db.query(
      `UPDATE tokens_usuario SET usado_en = now()
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > now()
       RETURNING id_usuario, tipo`,
      [hashToken(token)],
    );
    const fila = Array.isArray(filas) ? filas[0] : undefined;
    return fila ? { idUsuario: fila.id_usuario, tipo: fila.tipo } : null;
  }

  enlace(token: string, tipo: TipoTokenUsuario): string {
    const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001').split(',')[0].trim();
    const ruta = tipo === 'INVITACION' ? 'activar-cuenta' : 'restablecer-contrasena';
    return `${base.replace(/\/$/, '')}/${ruta}?token=${encodeURIComponent(token)}`;
  }

  /** Envía el correo sin bloquear la respuesta ni revelar errores de SMTP al cliente. */
  enviarEnSegundoPlano(email: string, nombre: string, token: string, tipo: TipoTokenUsuario) {
    const enlace = this.enlace(token, tipo);
    const horas = VIGENCIA_HORAS[tipo];
    const correo =
      tipo === 'INVITACION'
        ? {
            asunto: 'Invitación al CRM Contable',
            texto: `Hola ${nombre}:\n\nSe creó tu cuenta en el CRM Contable. Para activarla y definir tu contraseña abre este enlace (válido por ${horas} horas):\n\n${enlace}\n\nSi no esperabas este correo, ignóralo.`,
          }
        : {
            asunto: 'Recuperación de contraseña — CRM Contable',
            texto: `Hola ${nombre}:\n\nRecibimos una solicitud para restablecer tu contraseña. Abre este enlace (válido por ${horas} hora):\n\n${enlace}\n\nSi no la solicitaste, ignora este correo; tu contraseña no cambiará.`,
          };
    this.correo.enviar({ para: email, ...correo }).catch((err) => {
      this.logger.error(`No se pudo enviar el correo de ${tipo} a ${email}: ${err.message}`);
    });
  }
}
