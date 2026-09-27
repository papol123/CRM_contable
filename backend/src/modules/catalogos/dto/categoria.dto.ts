import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'Frenos y Discos', description: 'Nombre de la categoría' })
  @IsNotEmpty({ message: 'El nombre de la categoría es requerido' })
  @IsString()
  nombre: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de categoría padre' })
  @IsOptional()
  @IsUUID('4', { message: 'El idCategoriaPadre debe ser un UUID válido' })
  idCategoriaPadre?: string;
}

export class UpdateCategoriaDto {
  @ApiPropertyOptional({ example: 'Frenos y Discos Actualizado' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsUUID('4')
  idCategoriaPadre?: string;
}
