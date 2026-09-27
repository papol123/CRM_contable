import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de tercero (cliente o proveedor)' })
  @IsNotEmpty()
  @IsUUID('4')
  idTercero: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID del método de pago' })
  @IsNotEmpty()
  @IsUUID('4')
  idMetodoPago: string;

  @ApiProperty({
    example: 'factura de venta',
    enum: ['factura de venta', 'factura de compra'],
  })
  @IsNotEmpty()
  @IsIn(['factura de venta', 'factura de compra'])
  tipoPago: 'factura de venta' | 'factura de compra';

  @ApiProperty({ example: 1250000.00, description: 'Monto pagado o abonado' })
  @IsNotEmpty()
  @IsNumber()
  monto: number;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la factura a la que aplica' })
  @IsOptional()
  @IsUUID('4')
  idFactura?: string;
}

export class CreateGastoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de categoría de gasto' })
  @IsNotEmpty()
  @IsUUID('4')
  idCategoriaGasto: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idMetodoPago?: string;

  @ApiProperty({ example: 'Pago recibo energía eléctrica bodega marzo' })
  @IsNotEmpty()
  @IsString()
  descripcion: string;

  @ApiProperty({ example: 450000.00 })
  @IsNotEmpty()
  @IsNumber()
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
  descripcion?: string;

  @ApiPropertyOptional({ example: 470000.00 })
  @IsOptional()
  @IsNumber()
  monto?: number;
}
