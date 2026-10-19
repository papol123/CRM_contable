import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  PERMISOS_GLOBALES,
  asegurarPropietario,
  exigirFiltroOPermiso,
  filtroPropietario,
  puedeVerTodos,
} from './propiedad';
import { patronLike } from '../utils/busqueda';

describe('Propiedad de recursos (GEMINI.md §5.4 · OWASP API1:2023)', () => {
  const usuario = { id: 'u-1', permisos: ['ventas.consultar'] };
  const admin = { id: 'a-1', permisos: ['ventas.consultar', PERMISOS_GLOBALES.ventas] };

  it('sin el permiso global filtra por el usuario; con él no filtra', () => {
    expect(filtroPropietario(usuario, PERMISOS_GLOBALES.ventas)).toBe('u-1');
    expect(filtroPropietario(admin, PERMISOS_GLOBALES.ventas)).toBeNull();
  });

  it('las llamadas internas (sin actor) no se restringen', () => {
    expect(puedeVerTodos(undefined, PERMISOS_GLOBALES.ventas)).toBe(true);
    expect(() => asegurarPropietario('otro', undefined, PERMISOS_GLOBALES.ventas, 'x')).not.toThrow();
  });

  it('un recurso ajeno responde 404 (no revela que existe)', () => {
    expect(() => asegurarPropietario('otro', usuario, PERMISOS_GLOBALES.ventas, 'Remisión no encontrada')).toThrow(
      NotFoundException,
    );
    expect(() => asegurarPropietario(null, usuario, PERMISOS_GLOBALES.ventas, 'x')).toThrow(NotFoundException);
    expect(() => asegurarPropietario('u-1', usuario, PERMISOS_GLOBALES.ventas, 'x')).not.toThrow();
    expect(() => asegurarPropietario('otro', admin, PERMISOS_GLOBALES.ventas, 'x')).not.toThrow();
  });

  it('la consulta global sin filtro exige el permiso global (403)', () => {
    expect(() => exigirFiltroOPermiso(usuario, PERMISOS_GLOBALES.cartera, undefined, 'clienteId')).toThrow(
      ForbiddenException,
    );
    expect(() => exigirFiltroOPermiso(usuario, PERMISOS_GLOBALES.cartera, 'c-1', 'clienteId')).not.toThrow();
    expect(() =>
      exigirFiltroOPermiso({ id: 'a', permisos: [PERMISOS_GLOBALES.cartera] }, PERMISOS_GLOBALES.cartera, undefined, 'clienteId'),
    ).not.toThrow();
  });

  it('la búsqueda escapa los comodines de LIKE', () => {
    expect(patronLike(' Pistón ')).toBe('%pistón%');
    expect(patronLike('%_')).toBe('%\\%\\_%');
    expect(patronLike('a\\b')).toBe('%a\\\\b%');
  });
});
