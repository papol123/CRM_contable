import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoDto {
  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    description:
      'UUID del tercero. Opcional si se envía idFactura (se toma de la factura), idCliente o idProveedor',
  })
  @IsOptional()
  @IsUUID()
  idTercero?: string;

  @ApiPropertyOptional({ description: 'Alternativa a idTercero para pagos de clientes' })
  @IsOptional()
  @IsUUID()
  idCliente?: string;

  @ApiPropertyOptional({ description: 'Alternativa a idTercero para pagos a proveedores' })
  @IsOptional()
  @IsUUID()
  idProveedor?: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del método de pago' })
  @IsNotEmpty()
  @IsUUID()
  idMetodoPago: string;

  @ApiProperty({ example: 'factura de venta', enum: ['factura de venta', 'factura de compra'] })
  @IsIn(['factura de venta', 'factura de compra'])
  tipoPago: 'factura de venta' | 'factura de compra';

  @ApiProperty({ example: 1250000.0, description: 'Monto pagado o abonado (no puede superar el saldo de la factura)' })
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor que cero' })
  monto: number;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la factura a la que aplica' })
  @IsOptional()
  @IsUUID()
  idFactura?: string;

  @ApiPropertyOptional({ example: 'Transferencia Bancolombia ref. 998877' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class CreateGastoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de categoría de gasto' })
  @IsNotEmpty()
  @IsUUID()
  idCategoriaGasto: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID()
  idMetodoPago?: string;

  @ApiProperty({ example: 'Pago recibo energía eléctrica bodega marzo' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  descripcion: string;

  @ApiProperty({ example: 450000.0 })
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor que cero' })
  monto: number;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({ example: 'https://storage.crmcontable.com/soportes/gasto_102.pdf' })
  @IsOptional()
  @IsString()
  soporteUrl?: string;
}

export class UpdateGastoDto {
  @ApiPropertyOptional({ example: 'Pago recibo energía eléctrica bodega marzo corregido' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @ApiPropertyOptional({ example: 470000.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'El monto debe ser mayor que cero' })
  monto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  idCategoriaGasto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  idMetodoPago?: string;

  @ApiPropertyOptional({ example: '2026-03-28' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  soporteUrl?: string;
}
