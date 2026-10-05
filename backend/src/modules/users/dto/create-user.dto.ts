import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ContrasenaSegura } from '../../../common/validacion/contrasena';

export class CreateUserDto {
  @ApiProperty({ example: 'juan.perez@crmcontable.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  @MaxLength(150)
  email: string;

  @ApiPropertyOptional({
    example: 'ContraseñaSegura123*',
    description:
      'Opcional. Si no se envía, el usuario recibe por correo una invitación (válida 72 h) para definir su contraseña',
  })
  @IsOptional()
  @ContrasenaSegura()
  password?: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty({ message: 'Los nombres son requeridos' })
  @MaxLength(100)
  nombres: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty({ message: 'Los apellidos son requeridos' })
  @MaxLength(100)
  apellidos: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiProperty({ example: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f' })
  @IsUUID('4', { message: 'idRol debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El idRol es requerido' })
  idRol: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
