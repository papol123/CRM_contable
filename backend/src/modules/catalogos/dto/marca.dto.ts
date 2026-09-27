import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMarcaDto {
  @ApiProperty({ example: 'Brembo' })
  @IsNotEmpty({ message: 'El nombre de la marca es requerido' })
  @IsString()
  @MaxLength(100)
  nombre: string;

  @ApiPropertyOptional({ example: 'Italia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paisOrigen?: string;
}

export class UpdateMarcaDto {
  @ApiPropertyOptional({ example: 'Brembo S.p.A.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ example: 'Italia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paisOrigen?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
