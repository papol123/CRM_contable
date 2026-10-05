import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBodegaDto {
  @ApiProperty({ example: 'BOD-CAL-02', description: 'Código único de la bodega' })
  @IsNotEmpty({ message: 'El código es requerido' })
  @IsString()
  codigo: string;

  @ApiProperty({ example: 'Bodega Cali Norte', description: 'Nombre descriptivo de la bodega' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @IsString()
  nombre: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la ciudad donde se ubica' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateBodegaDto {
  @ApiPropertyOptional({ example: 'BOD-CAL-02' })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional({ example: 'Bodega Cali Norte Renovada' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
