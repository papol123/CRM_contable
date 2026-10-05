import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  IsDateString,
  IsBoolean,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

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

  @ApiProperty({ example: 1250000.0, description: 'Monto pagado o abonado (no puede superar el saldo del documento)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El monto debe ser mayor que cero' })
  @Max(9999999999999)
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
  @MaxLength(1000)
  observaciones?: string;
}

export class ConsultaPagosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ['factura de venta', 'factura de compra'] })
  @IsOptional()
  @IsIn(['factura de venta', 'factura de compra'])
  tipoPago?: 'factura de venta' | 'factura de compra';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  idTercero?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class ConsultaGastosDto extends PaginacionDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  incluirAnulados?: boolean;
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El monto debe ser mayor que cero' })
  @Max(9999999999999)
  monto: number;

  @ApiPropertyOptional({ example: '2026-03-27' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

}

export class UpdateGastoDto {
  @ApiPropertyOptional({ example: 'Pago recibo energía eléctrica bodega marzo corregido' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @ApiPropertyOptional({ example: 470000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El monto debe ser mayor que cero' })
  @Max(9999999999999)
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

}
