import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginacionDto } from '../../common/paginacion/paginacion';

export const TIPOS_CONTRATO = ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZAJE'] as const;

export class CreateEmpleadoDto {
  @ApiPropertyOptional({ description: 'Tercero existente. Si se omite, se crea con los datos de identificación' })
  @IsOptional()
  @IsUUID()
  idTercero?: string;

  @ApiPropertyOptional({ description: 'Obligatorio si no se envía idTercero' })
  @ValidateIf((o) => !o.idTercero)
  @IsUUID()
  idTipoDocumento?: string;

  @ApiPropertyOptional({ example: '1020304050', description: 'Obligatorio si no se envía idTercero' })
  @ValidateIf((o) => !o.idTercero)
  @Matches(/^[0-9A-Za-z.-]{3,30}$/, { message: 'Documento inválido' })
  numeroDocumento?: string;

  @ApiPropertyOptional({ example: 'Ana María Torres', description: 'Obligatorio si no se envía idTercero' })
  @ValidateIf((o) => !o.idTercero)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombreCompleto?: string;

  @ApiProperty({ example: 'Asesora comercial' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cargo: string;

  @ApiProperty({ example: 1800000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999)
  salarioBase: number;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  fechaIngreso: string;

  @ApiPropertyOptional({ enum: TIPOS_CONTRATO, default: 'TERMINO_INDEFINIDO' })
  @IsOptional()
  @IsIn(TIPOS_CONTRATO)
  tipoContrato?: string;
}

export class UpdateEmpleadoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cargo?: string;

  @ApiPropertyOptional({ example: 1900000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999)
  salarioBase?: number;

  @ApiPropertyOptional({ enum: TIPOS_CONTRATO })
  @IsOptional()
  @IsIn(TIPOS_CONTRATO)
  tipoContrato?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ConsultaEmpleadosDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Nombre, documento o cargo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Type(() => String)
  @IsIn(['true', 'false'])
  activo?: string;
}

export class AbrirPeriodoNominaDto {
  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Por defecto, el primer día del mes' })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Por defecto, el último día del mes' })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}

export class NovedadNominaDto {
  @ApiProperty()
  @IsUUID()
  idEmpleado: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  diasTrabajados?: number;

  @ApiPropertyOptional({ example: 120000, description: 'Valor de horas extras y recargos del periodo' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  horasExtras?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bonificaciones?: number;

  @ApiPropertyOptional({ example: 30000, description: 'Préstamos, libranzas u otros descuentos' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otrasDeducciones?: number;
}

export class CalcularNominaDto {
  @ApiPropertyOptional({ type: [NovedadNominaDto], description: 'Novedades por empleado; los no incluidos conservan las anteriores' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => NovedadNominaDto)
  novedades?: NovedadNominaDto[];
}

export class PagarNominaDto {
  @ApiPropertyOptional({ description: 'Método de pago del gasto generado' })
  @IsOptional()
  @IsUUID()
  idMetodoPago?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Fecha del pago (por defecto, hoy)' })
  @IsOptional()
  @IsDateString()
  fechaPago?: string;
}
