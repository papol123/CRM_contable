import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TIPOS_MOVIMIENTO_MANUAL = [
  'ENTRADA',
  'SALIDA',
  'AJUSTE_ENTRADA',
  'AJUSTE_SALIDA',
  'TRASLADO',
] as const;

export class RegistrarMovimientoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del producto' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la bodega (origen en traslados)' })
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

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Obligatorio en TRASLADO' })
  @ValidateIf((o) => o.tipoMovimiento === 'TRASLADO')
  @IsNotEmpty({ message: 'idBodegaDestino es obligatorio en un traslado' })
  @IsUUID()
  idBodegaDestino?: string;

  @ApiProperty({ example: 10, description: 'Cantidad de unidades (mayor que cero)' })
  @IsNumber()
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  cantidad: number;

  @ApiPropertyOptional({ example: 120000.0, description: 'Costo unitario (solo entradas). Si no se envía se usa el costo promedio' })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  costoUnitario?: number;

  @ApiPropertyOptional({ example: 'Ajuste inicial de inventario' })
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class AjusteFisicoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  idBodega: string;

  @ApiProperty({ example: 25, description: 'Cantidad física real contada' })
  @IsNumber()
  @Min(0, { message: 'La cantidad física no puede ser negativa' })
  cantidadFisica: number;

  @ApiPropertyOptional({ example: 'Conteo semestral de inventario físico' })
  @IsOptional()
  @IsString()
  motivo?: string;
}
