import {
  ArrayMinSize,
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

// ─── Resoluciones DIAN ──────────────────────────────────────────────────────

export class CreateResolucionDianDto {
  @ApiPropertyOptional({ example: 'SETP' })
  @IsOptional()
  @IsString()
  prefijo?: string;

  @ApiProperty({ example: '18764000001234' })
  @IsNotEmpty()
  @IsString()
  numeroResolucion: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsNotEmpty()
  @IsDateString()
  fechaExpedicion: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  rangoDesde: number;

  @ApiProperty({ example: 5000 })
  @IsInt()
  @Min(1)
  rangoHasta: number;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;

  @ApiPropertyOptional({ description: 'Clave técnica de la resolución electrónica (portal DIAN). Necesaria para el CUFE' })
  @IsOptional()
  @IsString()
  claveTecnica?: string;
}

export class UpdateResolucionDianDto {
  @ApiPropertyOptional({ example: 'SETP' })
  @IsOptional()
  @IsString()
  prefijo?: string;

  @ApiPropertyOptional({ example: '2027-06-30' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;

  @ApiPropertyOptional({ description: 'Clave técnica de la resolución electrónica (portal DIAN). Necesaria para el CUFE' })
  @IsOptional()
  @IsString()
  claveTecnica?: string;
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
  observacion?: string;

  @ApiPropertyOptional({ example: '2026-04-15', description: 'Por defecto, 15 días después de hoy' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;

  @ApiPropertyOptional({ type: [ItemFacturaVentaDto], description: 'Puede crearse en borrador sin items' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items?: ItemFacturaVentaDto[];
}

export class UpdateCotizacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacion?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;

  @ApiPropertyOptional({ type: [ItemFacturaVentaDto], description: 'Reemplaza todos los items' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaVentaDto)
  items?: ItemFacturaVentaDto[];
}

export class RechazarCotizacionDto {
  @ApiProperty({ example: 'Cliente optó por repuesto de menor gama' })
  @IsNotEmpty()
  @IsString()
  motivo: string;
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
  observacion?: string;

  @ApiProperty({ type: [ItemFacturaVentaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe incluir al menos un producto' })
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
  @ApiPropertyOptional({ example: 'Cliente canceló la compra' })
  @IsOptional()
  @IsString()
  motivo?: string;
}
