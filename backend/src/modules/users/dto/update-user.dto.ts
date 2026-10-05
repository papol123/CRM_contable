import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ example: 'juan.perez@crmcontable.com', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email?: string;

  @ApiProperty({ example: 'NuevaContraseña123*', required: false })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener mínimo 6 caracteres' })
  password?: string;

  @ApiProperty({ example: 'Juan', required: false })
  @IsOptional()
  @IsString()
  nombres?: string;

  @ApiProperty({ example: 'Pérez', required: false })
  @IsOptional()
  @IsString()
  apellidos?: string;

  @ApiProperty({ example: '+57 300 123 4567', required: false })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ example: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f', required: false })
  @IsOptional()
  @IsUUID('4', { message: 'idRol debe ser un UUID válido' })
  idRol?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
