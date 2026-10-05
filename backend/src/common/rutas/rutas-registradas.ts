import 'reflect-metadata';
import { RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AUTENTICADO_KEY, PERMISSIONS_KEY } from '../../modules/auth/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';

/**
 * Inventario de rutas a partir de los metadatos de los controladores. Lo usan
 * la prueba estructural (toda ruta declara su permiso) y la prueba E2E de
 * autorización (token de Usuario → ruta administrativa = 403).
 */
export interface Ruta {
  controlador: string;
  metodo: string;
  http: string;
  ruta: string;
  permisos: string[];
  autenticado: boolean;
  publico: boolean;
}

/** Recorre el árbol de módulos de AppModule y devuelve todos los controladores registrados. */
export function controladores(modulo: any, vistos = new Set<any>()): Type[] {
  const clase = modulo?.module ?? modulo;
  if (!clase || vistos.has(clase)) return [];
  vistos.add(clase);
  const propios: Type[] = [
    ...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, clase) || []),
    ...(modulo?.controllers || []),
  ];
  const importados: any[] = [...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, clase) || []), ...(modulo?.imports || [])];
  return [...propios, ...importados.flatMap((m) => controladores(m, vistos))];
}

export function rutasRegistradas(moduloRaiz: any): Ruta[] {
  const lista: Ruta[] = [];
  for (const controlador of new Set(controladores(moduloRaiz))) {
    const base = Reflect.getMetadata(PATH_METADATA, controlador) || '';
    for (const nombre of Object.getOwnPropertyNames(controlador.prototype)) {
      const handler = controlador.prototype[nombre];
      if (nombre === 'constructor' || typeof handler !== 'function') continue;
      const ruta = Reflect.getMetadata(PATH_METADATA, handler);
      if (ruta === undefined) continue;
      const leer = (clave: string) => Reflect.getMetadata(clave, handler) ?? Reflect.getMetadata(clave, controlador);
      lista.push({
        controlador: controlador.name,
        metodo: nombre,
        http: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)],
        ruta: `/${[base, ruta].filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1'),
        // Igual que PermissionsGuard: @Autenticado() en el método anula el permiso del controlador
        permisos: Reflect.getMetadata(AUTENTICADO_KEY, handler)
          ? []
          : (Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? Reflect.getMetadata(PERMISSIONS_KEY, controlador) ?? []),
        autenticado: !!leer(AUTENTICADO_KEY),
        publico: !!leer(IS_PUBLIC_KEY),
      });
    }
  }
  return lista;
}
