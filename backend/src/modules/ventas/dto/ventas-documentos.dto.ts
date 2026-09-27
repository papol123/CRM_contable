import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @IsNotEmpty()
  @IsNumber()
  rangoDesde: number;

  @ApiProperty({ example: 5000 })
  @IsNotEmpty()
  @IsNumber()
  rangoHasta: number;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  vigenteHasta?: string;
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
}

export class CreateCotizacionDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID('4')
  idCliente: string;

  @ApiPropertyOptional({ example: 'Cotización mantenimiento frenos y suspensión' })
  @IsOptional()
  @IsString()
  observacion?: string;
}

export class RechazarCotizacionDto {
  @ApiProperty({ example: 'Cliente optó por repuesto de menor gama' })
  @IsNotEmpty()
  @IsString()
  motivo: string;
}

export class UpdateEstadoPedidoDto {
  @ApiProperty({ example: 'ENVIADO', enum: ['RECIBIDO', 'EN_PROCESO', 'ENVIADO', 'ENTREGADO'] })
  @IsNotEmpty()
  @IsString()
  estado: string;
}
