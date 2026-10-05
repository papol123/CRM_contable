import {
  ArrayMaxSize,
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
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export class ItemFacturaCompraDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  @Max(999999999)
  cantidad: number;

  @ApiProperty({ example: 120000.0, description: 'Costo unitario antes de descuento e IVA' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  @Max(9999999999999)
  costoUnitario: number;

  @ApiPropertyOptional({ example: 5.0, description: 'Descuento comercial de la línea (%)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pctDescuento?: number;

  @ApiPropertyOptional({ example: 19.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
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

  @ApiPropertyOptional({ example: '9a8b7c6d5e4f...', description: 'CUFE de la factura electrónica del proveedor' })
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

  @ApiPropertyOptional({ example: 2.5, description: 'Retención en la fuente: % sobre la base sin IVA' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pctRetefuente?: number;

  @ApiPropertyOptional({ example: 15, description: 'ReteIVA: % sobre el IVA de la compra' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pctReteIva?: number;

  @ApiPropertyOptional({ example: 9.66, description: 'ReteICA: tarifa por mil (‰) sobre la base sin IVA' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  tarifaReteIcaPorMil?: number;

  @ApiProperty({ type: [ItemFacturaCompraDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La factura de compra debe incluir al menos un producto' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaCompraDto)
  items: ItemFacturaCompraDto[];
}

/** Solo campos no financieros. */
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

export class ConsultaComprasDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Número de factura o proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class ImportarXmlDto {
  @ApiPropertyOptional({ description: 'Proveedor esperado; si se omite se busca por el NIT del XML' })
  @IsOptional()
  @IsUUID()
  idProveedor?: string;
}
