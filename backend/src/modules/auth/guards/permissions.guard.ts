import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTENTICADO_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { contextoSolicitud } from '../../auditoria/auditar';

/**
 * Guard global de autorización por permisos (GEMINI.md §5.1 y §5.3).
 * Se ejecuta después de JwtAuthGuard; el usuario trae sus permisos efectivos
 * recargados desde base de datos en cada solicitud (JwtStrategy).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // @Autenticado() en el método libera esa ruta del permiso declarado en el controlador
    if (this.reflector.get<boolean>(AUTENTICADO_KEY, context.getHandler())) {
      return true;
    }
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const permisos: string[] = request.user?.permisos || [];
    const faltantes = requiredPermissions.filter((p) => !permisos.includes(p));

    if (faltantes.length > 0) {
      void this.auditoria.registrar({
        ...contextoSolicitud(request),
        accion: 'ACCESO_DENEGADO',
        recurso: 'auth',
        valorNuevo: { metodo: request.method, ruta: request.originalUrl, permisosFaltantes: faltantes },
        resultado: 'FALLO',
      });
      throw new ForbiddenException(`Permiso denegado: se requiere ${faltantes.join(', ')}`);
    }

    return true;
  }
}
