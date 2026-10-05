import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export const TIPOS_MOVIMIENTO_MANUAL = [
  'ENTRADA',
  'SALIDA',
  'AJUSTE_ENTRADA',
  'AJUSTE_SALIDA',
  'TRASLADO',
] as const;

const EJEMPLO_UUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

/** Motivo obligatorio: todo movimiento manual queda trazado en el kardex (catálogo §22). */
class ConMotivo {
  @ApiProperty({ example: 'Reposición de mostrador', description: 'Obligatorio: queda en el kardex y la bitácora' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(3)
  @MaxLength(500)
  motivo: string;
}

export class RegistrarMovimientoDto extends ConMotivo {
  @ApiProperty({ example: EJEMPLO_UUID, description: 'UUID del producto' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: EJEMPLO_UUID, description: 'UUID de la bodega (origen en traslados)' })
  @IsNotEmpty()
  @IsUUID()
  idBodega: string;

  @ApiProperty({
    example: 'ENTRADA',
    enum: TIPOS_MOVIMIENTO_MANUAL,
    description: 'TRASLADO genera una salida en idBodega y una entrada en idBodegaDestino',
  })
  @IsNotEmpty()
  @IsIn(TIPOS_MOVIMIENTO_MANUAL)
  tipoMovimiento: (typeof TIPOS_MOVIMIENTO_MANUAL)[number];

  @ApiPropertyOptional({ example: EJEMPLO_UUID, description: 'Obligatorio en TRASLADO' })
  @ValidateIf((o) => o.tipoMovimiento === 'TRASLADO')
  @IsNotEmpty({ message: 'idBodegaDestino es obligatorio en un traslado' })
  @IsUUID()
  idBodegaDestino?: string;

  @ApiProperty({ example: 10, description: 'Cantidad de unidades (mayor que cero, hasta 3 decimales)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  @Max(999999999)
  cantidad: number;

  @ApiPropertyOptional({ example: 120000.0, description: 'Costo unitario (solo entradas). Si no se envía se usa el costo promedio' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  costoUnitario?: number;
}

export class AjusteFisicoDto extends ConMotivo {
  @ApiProperty({ example: EJEMPLO_UUID })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: EJEMPLO_UUID })
  @IsNotEmpty()
  @IsUUID()
  idBodega: string;

  @ApiProperty({ example: 25, description: 'Cantidad física real contada' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'La cantidad física no puede ser negativa' })
  @Max(999999999)
  cantidadFisica: number;
}

class MovimientoSimpleDto extends ConMotivo {
  @ApiProperty({ example: EJEMPLO_UUID })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: EJEMPLO_UUID })
  @IsNotEmpty()
  @IsUUID()
  idBodega: string;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  @Max(999999999)
  cantidad: number;
}

export class EntradaInventarioDto extends MovimientoSimpleDto {
  @ApiPropertyOptional({ example: 55000, description: 'Si no se envía se usa el costo promedio vigente' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costoUnitario?: number;
}

export class SalidaInventarioDto extends MovimientoSimpleDto {}

export class DevolucionInventarioDto extends MovimientoSimpleDto {}

export class TrasladoInventarioDto {
  @ApiProperty({ example: EJEMPLO_UUID })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: EJEMPLO_UUID, description: 'Bodega origen' })
  @IsNotEmpty()
  @IsUUID()
  idBodegaOrigen: string;

  @ApiProperty({ example: EJEMPLO_UUID, description: 'Bodega destino' })
  @IsNotEmpty()
  @IsUUID()
  idBodegaDestino: string;

  @ApiProperty({ example: 3 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(999999999)
  cantidad: number;

  @ApiProperty({ example: 'Traslado por reposición entre sucursales' })
  @IsString()
  @IsNotEmpty({ message: 'La observación del traslado es obligatoria' })
  @MaxLength(500)
  observacion: string;
}

export class CrearConteoDto {
  @ApiProperty({ example: EJEMPLO_UUID })
  @IsNotEmpty()
  @IsUUID()
  idBodega: string;

  @ApiPropertyOptional({ example: 'Conteo mensual de filtros y lubricantes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class ItemConteoDto {
  @ApiProperty({ example: EJEMPLO_UUID })
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 15 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999999999)
  stockFisico: number;
}

export class CerrarConteoDto extends ConMotivo {
  @ApiProperty({ type: [ItemConteoDto], description: 'Cantidades físicas contadas. Los productos no incluidos no se ajustan' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ItemConteoDto)
  conteosFisicos: ItemConteoDto[];
}

export class ConsultaSaldosDto extends PaginacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bodegaId?: string;

  @ApiPropertyOptional({ description: 'Código o nombre del producto' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ConsultaMovimientosDto extends PaginacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bodegaId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;
}

export class ConsultaKardexDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bodegaId?: string;
}

export class ConsultaSinMovimientoDto {
  @ApiPropertyOptional({ example: 180, default: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  dias?: number;
}
