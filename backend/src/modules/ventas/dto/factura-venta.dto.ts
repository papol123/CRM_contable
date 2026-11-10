import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  MaxLength,
  MinLength,
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
import { Transform, Type } from 'class-transformer';
import { PaginacionDto } from '../../../common/paginacion/paginacion';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Línea de factura, cotización o pedido. */
export class ItemFacturaVentaDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del repuesto/producto' })
  @IsNotEmpty()
  @IsUUID()
  idProducto: string;

  @ApiProperty({ example: 2, description: 'Cantidad (mayor que cero, hasta 3 decimales)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Max(999999999)
  @IsPositive({ message: 'La cantidad debe ser mayor que cero' })
  cantidad: number;

  @ApiProperty({ example: 185000.0, description: 'Precio unitario (hasta 2 decimales)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(9999999999999)
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
  @MaxLength(1000)
  observaciones?: string;

  @ApiPropertyOptional({
    example: 'Pedro Gómez · 310 555 1234',
    description: 'Quién queda debiendo. Obligatorio en ventas a crédito a Consumidor final',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreDeudor?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'true: registra en la misma operación el pago por el total (venta de contado: queda PAGADA, sin cartera)',
  })
  @IsOptional()
  @IsBoolean()
  pagadaDeContado?: boolean;

  @ApiPropertyOptional({ description: 'Medio de pago de la venta de contado. Por defecto, EFECTIVO' })
  @IsOptional()
  @IsUUID()
  idMetodoPago?: string;

  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La remisión debe incluir al menos un producto' })
  @ArrayMaxSize(300)
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
  @MaxLength(1000)
  observaciones?: string;
}

export class AnularDocumentoDto {
  @ApiProperty({ example: 'Devolución total por garantía del cliente', description: 'Motivo (obligatorio, queda en la bitácora)' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(5, { message: 'Describa el motivo con al menos 5 caracteres' })
  @MaxLength(500)
  motivo: string;
}

export class ConsultaRemisionesDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Número de remisión, cliente o documento' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  anulada?: boolean;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

/**
 * Remisión rápida: solo número de la factura física y valor total (sin
 * detalle de repuestos ni inventario). Puede ser de contado (queda cobrada)
 * o a crédito (queda en Deudores).
 */
export class RemisionRapidaDto {
  @ApiProperty({ example: '004512', description: 'Número de la factura o remisión física (talonario)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  numeroFactura: string;

  @ApiProperty({ example: 185000, description: 'Valor total de la venta (COP)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999_999_999_999)
  valor: number;

  @ApiPropertyOptional({ example: '2026-11-09', description: 'Fecha de la venta. Por defecto, hoy' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiProperty({ example: false, description: 'true: queda a crédito (en Deudores); false: de contado (cobrada)' })
  @IsBoolean()
  credito: boolean;

  @ApiPropertyOptional({ example: 30, description: 'Días de plazo del crédito. Por defecto, 30' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(365)
  diasPlazo?: number;

  @ApiPropertyOptional({ description: 'Cliente. Por defecto, Consumidor final' })
  @IsOptional()
  @IsUUID()
  idCliente?: string;

  @ApiPropertyOptional({ example: 'Pedro Gómez · 310 555 1234', description: 'Obligatorio a crédito con Consumidor final' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreDeudor?: string;

  @ApiPropertyOptional({ description: 'Medio de pago si es de contado. Por defecto, EFECTIVO' })
  @IsOptional()
  @IsUUID()
  idMetodoPago?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
