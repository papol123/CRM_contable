import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  Matches,
  Max,
  MaxLength,
  MinLength,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemFacturaVentaDto } from './factura-venta.dto';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

// ─── Consecutivos ───────────────────────────────────────────────────────────

export class AjustarConsecutivoDto {
  @ApiPropertyOptional({ example: 'REM', description: 'Solo REMISION y CONTEO admiten cambio de prefijo' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'El prefijo admite de 1 a 10 letras mayúsculas o números' })
  prefijo?: string;

  @ApiPropertyOptional({ example: 1500, description: 'Siguiente número a emitir; debe ser mayor que el último emitido' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999999)
  siguiente?: number;

  @ApiProperty({ example: 'Inicio de numeración del nuevo talonario', description: 'Obligatorio: queda en la bitácora' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  motivo: string;
}

// ─── Cotizaciones ───────────────────────────────────────────────────────────

export class CreateCotizacionDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  idCliente: string;

  @ApiPropertyOptional({ example: 'Cotización mantenimiento frenos y suspensión' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;

  @ApiPropertyOptional({ example: '2026-04-15', description: 'Por defecto, 15 días después de hoy' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;

  @ApiPropertyOptional({ type: [ItemFacturaVentaDto], description: 'Puede crearse en borrador sin items' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items?: ItemFacturaVentaDto[];
}

export class UpdateCotizacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;

  @ApiPropertyOptional({ type: [ItemFacturaVentaDto], description: 'Reemplaza todos los items' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items?: ItemFacturaVentaDto[];
}

export class RechazarCotizacionDto {
  @ApiProperty({ example: 'Cliente optó por repuesto de menor gama' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  motivo: string;
}

export class EnviarCotizacionDto {
  @ApiPropertyOptional({ example: 'compras@cliente.com', description: 'Por defecto, el correo principal del cliente' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export const ESTADOS_COTIZACION = ['BORRADOR', 'APROBADA', 'RECHAZADA', 'CONVERTIDA'] as const;

export class ConsultaCotizacionesDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ESTADOS_COTIZACION })
  @IsOptional()
  @IsIn(ESTADOS_COTIZACION)
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

export class ConvertirCotizacionDto {
  @ApiPropertyOptional({ description: 'Bodega que reserva el stock. Por defecto, la primera activa' })
  @IsOptional()
  @IsUUID()
  idBodega?: string;
}

// ─── Pedidos ────────────────────────────────────────────────────────────────

export const ESTADOS_PEDIDO_EDITABLES = ['EN_PROCESO', 'ENVIADO', 'ENTREGADO'] as const;

export class CreatePedidoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  idCliente: string;

  @ApiPropertyOptional({ description: 'Bodega que reserva el stock. Por defecto, la primera activa' })
  @IsOptional()
  @IsUUID()
  idBodega?: string;

  @ApiPropertyOptional({ example: 'Despachar antes del viernes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;

  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe incluir al menos un producto' })
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items: ItemFacturaVentaDto[];
}

export class UpdateEstadoPedidoDto {
  @ApiProperty({
    example: 'EN_PROCESO',
    enum: ESTADOS_PEDIDO_EDITABLES,
    description: 'Solo se avanza un paso: RECIBIDO → EN_PROCESO → ENVIADO → ENTREGADO',
  })
  @IsIn(ESTADOS_PEDIDO_EDITABLES)
  estado: (typeof ESTADOS_PEDIDO_EDITABLES)[number];

  @ApiPropertyOptional({ example: 'Guía de transporte 123456' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;
}

export class FacturarPedidoDto {
  @ApiPropertyOptional({ example: '2026-04-27' })
  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  retefuente?: number;
}

export class AnularPedidoDto {
  @ApiProperty({ example: 'Cliente canceló la compra', description: 'Obligatorio: queda en la bitácora' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MinLength(5)
  @MaxLength(500)
  motivo: string;
}

export const ESTADOS_PEDIDO = ['RECIBIDO', 'EN_PROCESO', 'ENVIADO', 'ENTREGADO', 'FACTURADO', 'ANULADO'] as const;

export class ConsultaPedidosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: ESTADOS_PEDIDO })
  @IsOptional()
  @IsIn(ESTADOS_PEDIDO)
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}
