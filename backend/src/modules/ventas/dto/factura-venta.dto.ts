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
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Línea de factura, cotización o pedido. */
export class ItemFacturaVentaDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del repuesto/producto' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 2, description: 'Cantidad (mayor que cero)' })
  @IsNumber()
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  cantidad: number;

  @ApiProperty({ example: 185000.0, description: 'Precio unitario' })
  @IsNumber()
  @Min(0, { message: 'El valor unitario no puede ser negativo' })
  valorUnitario: number;

  @ApiPropertyOptional({ example: 5.0, description: 'Porcentaje de descuento (0 a 100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pctDescuento?: number;

  @ApiPropertyOptional({ example: 19.0, description: 'Porcentaje de IVA (0 a 100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pctIva?: number;
}

export class CreateFacturaVentaDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del cliente' })
  @IsNotEmpty()
  @IsUUID()
  idCliente: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'Bodega desde la que se descuenta stock. Por defecto, la primera bodega activa',
  })
  @IsOptional()
  @IsUUID()
  idBodega?: string;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  fechaExpedicion?: string;

  @ApiPropertyOptional({
    example: '2026-04-27',
    description: 'Por defecto: fecha de expedición + días de plazo del cliente',
  })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'La retención no puede ser negativa' })
  retefuente?: number;

  @ApiPropertyOptional({ example: 'Entrega en taller del cliente' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La factura debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items: ItemFacturaVentaDto[];
}

export class CalcularFacturaDto {
  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items: ItemFacturaVentaDto[];

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  porcentajeRetefuente?: number;
}

export class UpdateFacturaVentaDto {
  @ApiPropertyOptional({ example: '2026-05-15' })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 'Entrega en taller de cliente' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class AnularDocumentoDto {
  @ApiProperty({ example: 'Devolución total por garantía del cliente', description: 'Motivo de la anulación' })
  @IsNotEmpty()
  @IsString()
  motivo: string;
}
