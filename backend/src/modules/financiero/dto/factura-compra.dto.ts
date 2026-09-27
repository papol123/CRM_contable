import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ItemFacturaCompraDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  cantidad: number;

  @ApiProperty({ example: 120000.0, description: 'Costo unitario antes de IVA' })
  @IsNumber()
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  costoUnitario: number;

  @ApiPropertyOptional({ example: 19.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pctIva?: number;
}

export class CreateFacturaCompraDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del proveedor' })
  @IsNotEmpty()
  @IsUUID()
  idProveedor: string;

  @ApiPropertyOptional({ example: 'FAC-PROV-10293', description: 'Único por proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroFactura?: string;

  @ApiPropertyOptional({ example: '9a8b7c6d5e4f...' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cufe?: string;

  @ApiProperty({ example: '2026-03-25' })
  @IsNotEmpty()
  @IsDateString()
  fechaEmision: string;

  @ApiPropertyOptional({ example: '2026-04-25', description: 'Por defecto: emisión + días de plazo del proveedor' })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Bodega de destino. Por defecto, la primera activa' })
  @IsOptional()
  @IsUUID()
  idBodega?: string;

  @ApiProperty({ type: [ItemFacturaCompraDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La factura de compra debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaCompraDto)
  items: ItemFacturaCompraDto[];
}

export class UpdateFacturaCompraDto {
  @ApiPropertyOptional({ example: '2026-05-25' })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 'FAC-PROV-10293-REV' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroFactura?: string;
}
