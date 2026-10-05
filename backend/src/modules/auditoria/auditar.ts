import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditoriaService } from './auditoria.service';

export const AUDITAR_KEY = 'auditar';

export interface OpcionesAuditar {
  /** Acción en mayúsculas, p. ej. ANULAR, CREAR, AJUSTAR_STOCK */
  accion: string;
  /** Recurso afectado (nombre de la tabla principal) */
  recurso: string;
  /** Parámetro de ruta con el id del recurso (por defecto `id`) */
  parametroId?: string;
  /** Guardar el cuerpo de la solicitud como valor nuevo en lugar de la respuesta */
  registrarCuerpo?: boolean;
}

/**
 * Registra la operación en la bitácora de auditoría con su resultado
 * (EXITOSO o FALLO), usuario, IP, motivo y valor nuevo (GEMINI.md §5, catálogo §29).
 * Cuando hace falta el valor anterior, el servicio lo registra dentro de su
 * propia transacción con AuditoriaService.registrar(evento, manager).
 */
export const Auditar = (opciones: OpcionesAuditar) => SetMetadata(AUDITAR_KEY, opciones);

type Solicitud = Request;

export function contextoSolicitud(req: Solicitud) {
  return {
    idUsuario: ((req as any).user?.id as string) ?? null,
    ip: req.ip || null,
    userAgent: (req.headers['user-agent'] as string) || null,
  };
}

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opciones = this.reflector.get<OpcionesAuditar>(AUDITAR_KEY, context.getHandler());
    if (!opciones) return next.handle();

    const req = context.switchToHttp().getRequest<Solicitud>();
    const idParam = req.params?.[opciones.parametroId || 'id'] as string | undefined;
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo : null;
    const base = {
      ...contextoSolicitud(req),
      accion: opciones.accion,
      recurso: opciones.recurso,
      motivo,
    };

    return next.handle().pipe(
      tap((respuesta: any) => {
        void this.auditoria.registrar({
          ...base,
          idRecurso: idParam || respuesta?.id || null,
          valorNuevo: opciones.registrarCuerpo ? req.body : respuesta,
          resultado: 'EXITOSO',
        });
      }),
      catchError((err) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        const detalle = err instanceof HttpException ? (err.getResponse() as any)?.message ?? err.message : 'Error interno';
        void this.auditoria.registrar({
          ...base,
          idRecurso: idParam || null,
          valorNuevo: { status, error: Array.isArray(detalle) ? detalle.join('; ') : String(detalle) },
          motivo: motivo,
          resultado: 'FALLO',
        });
        return throwError(() => err);
      }),
    );
  }
}
