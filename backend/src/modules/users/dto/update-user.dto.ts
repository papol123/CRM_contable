import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, IsBoolean, MaxLength } from 'class-validator';
import { ContrasenaSegura } from '../../../common/validacion/contrasena';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'juan.perez@crmcontable.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: 'NuevaContraseña123*' })
  @IsOptional()
  @ContrasenaSegura()
  password?: string;

  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombres?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  apellidos?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiPropertyOptional({ example: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f' })
  @IsOptional()
  @IsUUID('4', { message: 'idRol debe ser un UUID válido' })
  idRol?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ConsultaUsuariosDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Busca en nombres, apellidos y correo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por UUID de rol' })
  @IsOptional()
  @IsUUID()
  idRol?: string;
}
