import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ItemFacturaVentaDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del repuesto/producto' })
  @IsNotEmpty()
  @IsUUID('4')
  idProducto: string;

  @ApiProperty({ example: 2, description: 'Cantidad facturada' })
  @IsNotEmpty()
  @IsNumber()
  cantidad: number;

  @ApiProperty({ example: 185000.00, description: 'Precio unitario' })
  @IsNotEmpty()
  @IsNumber()
  valorUnitario: number;

  @ApiPropertyOptional({ example: 5.0, description: 'Porcentaje de descuento' })
  @IsOptional()
  @IsNumber()
  pctDescuento?: number;

  @ApiPropertyOptional({ example: 19.0, description: 'Porcentaje de IVA (ej. 19)' })
  @IsOptional()
  @IsNumber()
  pctIva?: number;
}

export class CreateFacturaVentaDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del cliente' })
  @IsNotEmpty()
  @IsUUID('4')
  idCliente: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la bodega desde la que se descuenta stock' })
  @IsOptional()
  @IsUUID('4')
  idBodega?: string;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  fechaExpedicion?: string;

  @ApiPropertyOptional({ example: '2026-04-27' })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  retefuente?: number;

  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items: ItemFacturaVentaDto[];
}

export class CalcularFacturaDto {
  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items: ItemFacturaVentaDto[];

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
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
