import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { from, Observable, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { DataSource } from 'typeorm';

export const IDEMPOTENTE_KEY = 'idempotente';
export const HEADER_IDEMPOTENCIA = 'idempotency-key';
const VIGENCIA_HORAS = 24;

/**
 * Marca un endpoint transaccional como idempotente (GEMINI.md §5.5).
 * Si el cliente envía `Idempotency-Key`, un reintento con la misma clave y el
 * mismo cuerpo devuelve la respuesta original sin volver a ejecutar la operación.
 */
export const Idempotente = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENTE_KEY, true),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description:
        'Clave única por operación (p. ej. un UUID). Reintentos con la misma clave y el mismo cuerpo devuelven la respuesta original durante 24 h',
    }),
  );

/** JSON con las claves ordenadas, para que el hash no dependa del orden de los campos. */
export function jsonEstable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(jsonEstable).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonEstable(obj[k])}`)
    .join(',')}}`;
}

@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const activo = this.reflector.getAllAndOverride<boolean>(IDEMPOTENTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!activo) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    // Nest fija el código de estado después de los interceptores: se toma del decorador @HttpCode
    const codigo =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ?? (req.method === 'POST' ? 201 : 200);
    const clave = req.headers[HEADER_IDEMPOTENCIA];
    if (clave === undefined) return next.handle();

    if (typeof clave !== 'string' || clave.trim().length === 0 || clave.length > 255) {
      throw new BadRequestException('La cabecera Idempotency-Key debe tener entre 1 y 255 caracteres');
    }
    if (!req.user?.id) return next.handle();

    const idUsuario = req.user.id;
    const ruta = (req.route?.path as string) || req.path;
    const hash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl}\n${jsonEstable(req.body)}`)
      .digest('hex');

    return from(this.reservar(idUsuario, clave, req.method, ruta, hash)).pipe(
      mergeMap((previa) => {
        if (previa) {
          res.setHeader('Idempotent-Replayed', 'true');
          return of(previa.respuesta);
        }
        return next.handle().pipe(
          mergeMap((cuerpo) =>
            from(this.completar(idUsuario, clave, codigo, cuerpo)).pipe(mergeMap(() => of(cuerpo))),
          ),
          catchError((err) =>
            // Si la operación falló se libera la clave: la transacción ya se revirtió y se puede reintentar
            from(this.liberar(idUsuario, clave)).pipe(
              mergeMap(() => {
                throw err;
              }),
            ),
          ),
        );
      }),
    );
  }

  /**
   * Registra la clave como EN_PROCESO. Devuelve la respuesta guardada si la
   * operación ya se completó con el mismo cuerpo.
   */
  private async reservar(idUsuario: string, clave: string, metodo: string, ruta: string, hash: string) {
    await this.dataSource.query(
      `DELETE FROM idempotencia_solicitudes WHERE id_usuario = $1 AND clave = $2 AND expira_en < now()`,
      [idUsuario, clave],
    );

    const insertada = await this.dataSource.query(
      `INSERT INTO idempotencia_solicitudes (id_usuario, clave, metodo, ruta, hash_cuerpo, expira_en)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6))
       ON CONFLICT (id_usuario, clave) DO NOTHING
       RETURNING id_solicitud`,
      [idUsuario, clave, metodo, ruta, hash, VIGENCIA_HORAS],
    );
    if (insertada.length) return null;

    const [existente] = await this.dataSource.query(
      `SELECT hash_cuerpo, estado, codigo_http, respuesta, metodo, ruta
         FROM idempotencia_solicitudes WHERE id_usuario = $1 AND clave = $2`,
      [idUsuario, clave],
    );
    if (!existente) {
      // Se liberó entre el INSERT y el SELECT: el cliente puede reintentar
      throw new ConflictException('La solicitud con esta Idempotency-Key cambió de estado. Reintente');
    }
    if (existente.hash_cuerpo !== hash) {
      throw new UnprocessableEntityException({
        message: 'La Idempotency-Key ya se usó con una solicitud distinta. Use una clave nueva por operación',
        tipo: 'idempotencia-clave-reutilizada',
      });
    }
    if (existente.estado === 'EN_PROCESO') {
      throw new ConflictException({
        message: 'Ya hay una solicitud en proceso con esta Idempotency-Key',
        tipo: 'idempotencia-en-proceso',
      });
    }
    return existente as { codigo_http: number; respuesta: unknown };
  }

  private async completar(idUsuario: string, clave: string, codigo: number, cuerpo: unknown) {
    await this.dataSource.query(
      `UPDATE idempotencia_solicitudes
          SET estado = 'COMPLETADO', codigo_http = $3, respuesta = $4
        WHERE id_usuario = $1 AND clave = $2`,
      [idUsuario, clave, codigo, JSON.stringify(cuerpo ?? null)],
    );
  }

  private async liberar(idUsuario: string, clave: string) {
    await this.dataSource.query(
      `DELETE FROM idempotencia_solicitudes WHERE id_usuario = $1 AND clave = $2 AND estado = 'EN_PROCESO'`,
      [idUsuario, clave],
    );
  }
}
