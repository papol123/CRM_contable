import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegistrarMovimientoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del producto' })
  @IsNotEmpty()
  @IsUUID('4')
  idProducto: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la bodega' })
  @IsNotEmpty()
  @IsUUID('4')
  idBodega: string;

  @ApiProperty({
    example: 'ENTRADA',
    enum: ['ENTRADA', 'SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'TRASLADO'],
  })
  @IsNotEmpty()
  @IsIn(['ENTRADA', 'SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'TRASLADO'])
  tipoMovimiento: string;

  @ApiProperty({ example: 10, description: 'Cantidad de unidades' })
  @IsNotEmpty()
  @IsNumber()
  cantidad: number;

  @ApiPropertyOptional({ example: 120000.00, description: 'Costo unitario de adquisición' })
  @IsOptional()
  @IsNumber()
  costoUnitario?: number;

  @ApiPropertyOptional({ example: 'Ajuste inicial de inventario o factura compra' })
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class AjusteFisicoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID('4')
  idProducto: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID('4')
  idBodega: string;

  @ApiProperty({ example: 25, description: 'Cantidad física real contada' })
  @IsNotEmpty()
  @IsNumber()
  cantidadFisica: number;

  @ApiPropertyOptional({ example: 'Conteo semestral de inventario físico' })
  @IsOptional()
  @IsString()
  motivo?: string;
}
