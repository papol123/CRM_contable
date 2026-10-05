import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContrasenaSegura } from '../../../common/validacion/contrasena';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Carlos Andrés', description: 'Nombres del usuario' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombres?: string;

  @ApiPropertyOptional({ example: 'Pérez Gómez', description: 'Apellidos del usuario' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  apellidos?: string;

  @ApiPropertyOptional({ example: '3001234567', description: 'Número de teléfono de contacto' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'PasswordActual123*', description: 'Contraseña actual' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es requerida' })
  currentPassword: string;

  @ApiProperty({ example: 'NuevaPassword456*', description: 'Nueva contraseña (mínimo 8 caracteres con letras y números)' })
  @ContrasenaSegura()
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'usuario@crmcontable.com', description: 'Correo registrado para recuperación' })
  @IsEmail({}, { message: 'Formato de correo inválido' })
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordWithTokenDto {
  @ApiProperty({ description: 'Token de un solo uso recibido por correo (recuperación o invitación)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  @ApiProperty({ example: 'NuevaPasswordSegura123*', description: 'Nueva contraseña (mínimo 8 caracteres con letras y números)' })
  @ContrasenaSegura()
  newPassword: string;
}
