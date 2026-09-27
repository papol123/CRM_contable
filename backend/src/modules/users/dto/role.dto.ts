import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'VENDEDOR', description: 'Código único en mayúsculas' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'El código solo admite mayúsculas, números y guion bajo' })
  codigo: string;

  @ApiProperty({ example: 'Vendedor de mostrador' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @ApiPropertyOptional({ example: 'Factura y consulta inventario' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ type: [String], description: 'UUIDs de permisos' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permisos?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Vendedor senior' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ReplaceRolePermisosDto {
  @ApiProperty({ type: [String], description: 'UUIDs de los permisos que tendrá el rol' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permisos: string[];
}
