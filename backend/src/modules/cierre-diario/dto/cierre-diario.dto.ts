import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export const MEDIOS_PAGO_CIERRE = ['EFECTIVO', 'TRANSFERENCIA', 'DATAFONO', 'OTRO'] as const;
const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTO_MAXIMO = 999_999_999_999;

/** Monto en pesos: positivo o cero, máximo 2 decimales. */
function Monto(min = 0) {
  return (target: object, key: string) => {
    Type(() => Number)(target, key);
    IsNumber({ maxDecimalPlaces: 2 })(target, key);
    Min(min)(target, key);
    Max(MONTO_MAXIMO)(target, key);
  };
}

export class FechaCierreParamDto {
  @ApiProperty({ example: '2026-11-08', description: 'Día del cierre (YYYY-MM-DD)' })
  @Matches(FECHA, { message: 'La fecha debe tener el formato YYYY-MM-DD' })
  fecha: string;
}

export class FechaCierreQueryDto {
  @ApiProperty({ example: '2026-11-08', description: 'Día a consultar (YYYY-MM-DD)' })
  @Matches(FECHA, { message: 'La fecha debe tener el formato YYYY-MM-DD' })
  fecha: string;
}

export class ConsultaCierresDiariosDto extends PaginacionDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class AjusteRemisionDto {
  @ApiProperty({ description: 'Remisión del sistema cuyo estado de cobro se corrige en el arqueo' })
  @IsUUID()
  idFactura: string;

  @ApiProperty({ description: 'true si el dinero entró a caja ese día' })
  @IsBoolean()
  pagada: boolean;
}

export class RemisionManualDto {
  @ApiPropertyOptional({ description: 'Identificador del ítem en pantalla' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiPropertyOptional({ example: 'REM-MAN-0012' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  numero?: string;

  @ApiProperty({ example: 'Taller El Pistón' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  cliente: string;

  @ApiProperty({ example: 150000 })
  @Monto(0.01)
  total: number;

  @ApiProperty()
  @IsBoolean()
  pagada: boolean;

  @ApiPropertyOptional({ enum: MEDIOS_PAGO_CIERRE })
  @IsOptional()
  @IsIn(MEDIOS_PAGO_CIERRE)
  medioPago?: string;
}

export class GastoManualDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ example: 'Almuerzos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  concepto: string;

  @ApiPropertyOptional({ example: 'OPERATIVO' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categoria?: string;

  @ApiProperty({ example: 35000 })
  @Monto(0.01)
  monto: number;

  @ApiPropertyOptional({ enum: MEDIOS_PAGO_CIERRE })
  @IsOptional()
  @IsIn(MEDIOS_PAGO_CIERRE)
  medioPago?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  beneficiario?: string;
}

export class CompraManualDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ example: 'Distribuidora Andina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  proveedor: string;

  @ApiPropertyOptional({ example: 'FC-9923' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroFactura?: string;

  @ApiProperty({ example: 420000 })
  @Monto(0.01)
  monto: number;

  @ApiProperty({ description: 'true si se pagó ese día (resta de caja)' })
  @IsBoolean()
  pagada: boolean;

  @ApiPropertyOptional({ enum: MEDIOS_PAGO_CIERRE })
  @IsOptional()
  @IsIn(MEDIOS_PAGO_CIERRE)
  medioPago?: string;
}

export class GuardarCierreDiarioDto {
  @ApiProperty({ example: 0, description: 'Facturado el día anterior que entra hoy a caja' })
  @Monto()
  facturadoDiaAnterior: number;

  @ApiProperty({ example: 1250000, description: 'Efectivo físico contado en el arqueo' })
  @Monto()
  efectivoReal: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @ApiPropertyOptional({ type: [AjusteRemisionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AjusteRemisionDto)
  ajustesRemisiones?: AjusteRemisionDto[];

  @ApiPropertyOptional({ type: [RemisionManualDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RemisionManualDto)
  remisionesManuales?: RemisionManualDto[];

  @ApiPropertyOptional({ type: [GastoManualDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GastoManualDto)
  gastosManuales?: GastoManualDto[];

  @ApiPropertyOptional({ type: [CompraManualDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CompraManualDto)
  comprasManuales?: CompraManualDto[];
}
