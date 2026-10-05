import { ApiProperty } from '@nestjs/swagger';
import { ContrasenaSegura } from '../../../common/validacion/contrasena';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NuevaClave123*', description: 'Mínimo 8 caracteres con letras y números' })
  @ContrasenaSegura()
  password: string;
}
