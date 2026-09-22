import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.permisos) {
      throw new ForbiddenException('No tiene permisos para realizar esta acción');
    }

    const hasPermission = requiredPermissions.every((permission) =>
      user.permisos.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Permiso denegado: Se requiere uno de los siguientes permisos: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
