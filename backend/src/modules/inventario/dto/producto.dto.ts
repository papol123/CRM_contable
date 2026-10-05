import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsPositive,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductoDto {
  @ApiProperty({ example: 'REP-SUS-003', description: 'Código o referencia única' })
  @IsNotEmpty()
  @IsString()
  codigo: string;

  @ApiProperty({ example: 'Espiral de Suspensión Delantero Reforzado', description: 'Nombre del repuesto' })
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCategoria?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idUnidad?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idImpuestoVenta?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la marca' })
  @IsOptional()
  @IsUUID()
  idMarca?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  manejaInventario?: boolean;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  stockMinimo?: number;

  @ApiPropertyOptional({ example: 120000.00, description: 'Precio de venta base para lista pública' })
  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'El precio base debe ser mayor que cero' })
  precioBase?: number;
}

export class UpdateProductoDto {
  @ApiPropertyOptional({ example: 'Espiral de Suspensión Delantero Reforzado V2' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCategoria?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idUnidad?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idImpuestoVenta?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la marca' })
  @IsOptional()
  @IsUUID()
  idMarca?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdatePrecioDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de lista de precios' })
  @IsNotEmpty()
  @IsUUID('4')
  idLista: string;

  @ApiProperty({ example: 195000.00, description: 'Nuevo precio' })
  @IsNumber()
  @IsPositive({ message: 'El precio debe ser mayor que cero' })
  precio: number;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  vigenteDesde?: string;
}

export class UpdateStockMinimoDto {
  @ApiProperty({ example: 15, description: 'Nuevo valor de stock mínimo para alertas' })
  @IsNumber()
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  stockMinimo: number;
}

export class ItemPrecioMasivoDto {
  @ApiProperty({ example: 'REP-FRE-001' })
  @IsNotEmpty()
  @IsString()
  codigoProducto: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID('4')
  idLista: string;

  @ApiProperty({ example: 195000.00 })
  @IsNumber()
  @IsPositive({ message: 'El precio debe ser mayor que cero' })
  nuevoPrecio: number;
}

export class PreciosMasivosDto {
  @ApiProperty({ type: [ItemPrecioMasivoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemPrecioMasivoDto)
  cambios: ItemPrecioMasivoDto[];
}
