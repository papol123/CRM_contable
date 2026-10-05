import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

export class RangoFechasDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Por defecto, 30 días antes de "hasta"' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Por defecto, hoy' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class PeriodoDto {
  @ApiPropertyOptional({ example: '2026-09', description: 'Mes YYYY-MM (por defecto, el actual)' })
  @IsOptional()
  @Matches(PERIODO, { message: 'El periodo debe tener el formato YYYY-MM' })
  periodo?: string;
}

export class CierreMensualDto {
  @ApiProperty({ example: '2026-09', description: 'Mes a cerrar (YYYY-MM), anterior al mes en curso' })
  @Matches(PERIODO, { message: 'El periodo debe tener el formato YYYY-MM' })
  periodo: string;

  @ApiPropertyOptional({ example: 'Cierre revisado por contabilidad' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class ReabrirPeriodoDto {
  @ApiProperty({ example: 'Corrección de una compra registrada con fecha errada' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  motivo: string;
}

export const TIPOS_REPORTE_EXPORTABLE = [
  'ventas',
  'inventario',
  'cartera',
  'compras',
  'gastos',
  'utilidad',
  'rentabilidad',
  'flujo-caja',
  'ventas-por-vendedor',
  'estado-resultados',
  'inventario-valorizado',
] as const;
export type TipoReporte = (typeof TIPOS_REPORTE_EXPORTABLE)[number];

export class ParametrosReporteDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @Matches(PERIODO, { message: 'El periodo debe tener el formato YYYY-MM' })
  periodo?: string;
}

export class ExportarReporteDto {
  @ApiProperty({ enum: TIPOS_REPORTE_EXPORTABLE })
  @IsIn(TIPOS_REPORTE_EXPORTABLE)
  tipo: TipoReporte;

  @ApiPropertyOptional({ type: ParametrosReporteDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ParametrosReporteDto)
  parametros?: ParametrosReporteDto;
}

export class DashboardConfigDto {
  @ApiProperty({ example: ['ventas_mes', 'top_productos', 'cartera_vencida'], description: 'Widgets visibles en orden' })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  graficas: string[];

  @ApiPropertyOptional({ example: { rangoDias: 30 }, description: 'Preferencias libres de la vista (máx. 4 KB)' })
  @IsOptional()
  @IsObject()
  preferencias?: Record<string, unknown>;
}
