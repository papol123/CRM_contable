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
  ArrayMaxSize,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export class CreateProductoDto {
  @ApiProperty({ example: 'REP-SUS-003', description: 'Código o referencia única' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9._\-/]+$/, { message: 'El código solo admite letras, números, punto, guion y barra' })
  codigo: string;

  @ApiProperty({ example: 'Espiral de Suspensión Delantero Reforzado', description: 'Nombre del repuesto' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
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
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  @Max(999999999)
  stockMinimo?: number;

  @ApiPropertyOptional({
    example: 120000.0,
    description: 'Precio de venta base para la lista pública. Requiere el permiso productos.precios',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El precio base debe ser mayor que cero' })
  precioBase?: number;
}

/** Datos no financieros: un Usuario no puede cambiar precio ni costo (catálogo §8). */
export class UpdateProductoDto {
  @ApiPropertyOptional({ example: 'Espiral de Suspensión Delantero Reforzado V2' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
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

  @ApiPropertyOptional({ example: true, description: 'Reactivar o desactivar requiere el permiso productos.eliminar' })
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El precio debe ser mayor que cero' })
  precio: number;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  vigenteDesde?: string;

  @ApiPropertyOptional({ example: 'Ajuste por nueva lista del proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class UpdateStockMinimoDto {
  @ApiProperty({ example: 15, description: 'Nuevo valor de stock mínimo para alertas' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Max(999999999)
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El precio debe ser mayor que cero' })
  nuevoPrecio: number;
}

export class PreciosMasivosDto {
  @ApiProperty({ type: [ItemPrecioMasivoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ItemPrecioMasivoDto)
  cambios: ItemPrecioMasivoDto[];

  @ApiPropertyOptional({ example: 'Incremento anual de precios' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class EquivalenciaDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Producto equivalente' })
  @IsUUID()
  idEquivalente: string;

  @ApiPropertyOptional({ example: 'Misma medida, otra marca' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacion?: string;
}

export class ConsultaProductosDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Código o nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  marcaId?: string;
}

export class BuscarProductosDto {
  @ApiProperty({ example: 'filtro aceite', description: 'Código o nombre (mínimo 2 caracteres)' })
  @IsString()
  @MaxLength(100)
  @Matches(/\S{2,}/, { message: 'Escriba al menos 2 caracteres' })
  q: string;
}
