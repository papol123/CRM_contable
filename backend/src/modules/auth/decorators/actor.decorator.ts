import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Quién ejecuta la operación, para auditoría y control de propiedad. */
export interface Actor {
  id: string;
  permisos: string[];
  ip?: string;
  userAgent?: string;
}

export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest();
  return {
    id: req.user?.id,
    permisos: req.user?.permisos || [],
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
});
