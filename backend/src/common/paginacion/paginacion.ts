import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 100;

/** Parámetros `?page=&limit=` comunes a todos los listados (catálogo §33.12). */
export class PaginacionDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: LIMITE_POR_DEFECTO, minimum: 1, maximum: LIMITE_MAXIMO, default: LIMITE_POR_DEFECTO })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_MAXIMO)
  limit?: number;
}

export interface Paginado<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface Pagina {
  page: number;
  limit: number;
  offset: number;
}

export function normalizarPaginacion(p: PaginacionDto = {}): Pagina {
  const page = Math.max(1, Number(p.page) || 1);
  const limit = Math.min(LIMITE_MAXIMO, Math.max(1, Number(p.limit) || LIMITE_POR_DEFECTO));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginado<T>(data: T[], total: number, pagina: Pagina): Paginado<T> {
  return {
    data,
    meta: {
      total,
      page: pagina.page,
      limit: pagina.limit,
      totalPages: Math.ceil(total / pagina.limit),
    },
  };
}

/** Pagina en memoria un resultado ya calculado (saldos de cartera, reportes). */
export function paginarArreglo<T>(items: T[], p: PaginacionDto = {}): Paginado<T> {
  const pagina = normalizarPaginacion(p);
  return paginado(items.slice(pagina.offset, pagina.offset + pagina.limit), items.length, pagina);
}
