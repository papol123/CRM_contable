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

export class ItemFacturaCompraDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID('4')
  idProducto: string;

  @ApiProperty({ example: 20 })
  @IsNotEmpty()
  @IsNumber()
  cantidad: number;

  @ApiProperty({ example: 120000.00 })
  @IsNotEmpty()
  @IsNumber()
  costoUnitario: number;

  @ApiPropertyOptional({ example: 19.0 })
  @IsOptional()
  @IsNumber()
  pctIva?: number;
}

export class CreateFacturaCompraDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del proveedor' })
  @IsNotEmpty()
  @IsUUID('4')
  idProveedor: string;

  @ApiPropertyOptional({ example: 'FAC-PROV-10293' })
  @IsOptional()
  @IsString()
  numeroFactura?: string;

  @ApiPropertyOptional({ example: '9a8b7c6d5e4f...' })
  @IsOptional()
  @IsString()
  cufe?: string;

  @ApiProperty({ example: '2026-03-25' })
  @IsNotEmpty()
  @IsDateString()
  fechaEmision: string;

  @ApiPropertyOptional({ example: '2026-04-25' })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la bodega de destino' })
  @IsOptional()
  @IsUUID('4')
  idBodega?: string;

  @ApiProperty({ type: [ItemFacturaCompraDto] })
  @IsArray()
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
  numeroFactura?: string;
}
