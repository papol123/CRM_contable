import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateImpuestoDto {
  @ApiProperty({ example: 'IVA_19', description: 'Código del impuesto' })
  @IsNotEmpty()
  @IsString()
  codigo: string;

  @ApiProperty({ example: 19.00, description: 'Porcentaje del impuesto' })
  @IsNotEmpty()
  @IsNumber()
  porcentaje: number;

  @ApiPropertyOptional({ example: 'IVA GENERAL' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiProperty({ example: '2026-01-01', description: 'Fecha desde la cual entra en vigencia' })
  @IsNotEmpty()
  @IsDateString()
  vigenteDesde: string;
}

export class UpdateImpuestoDto {
  @ApiPropertyOptional({ example: 'IVA_19' })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional({ example: 19.00 })
  @IsOptional()
  @IsNumber()
  porcentaje?: number;

  @ApiPropertyOptional({ example: 'IVA GENERAL' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  vigenteDesde?: string;
}

export class CreateCategoriaGastoDto {
  @ApiProperty({ example: 'Servicios Públicos', description: 'Nombre de la categoría de gasto' })
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @ApiPropertyOptional({ example: '5135', description: 'Código PUC' })
  @IsOptional()
  @IsString()
  codigoPuc?: string;
}

export class UpdateCategoriaGastoDto {
  @ApiPropertyOptional({ example: 'Servicios Públicos de Energía' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: '513530' })
  @IsOptional()
  @IsString()
  codigoPuc?: string;
}
