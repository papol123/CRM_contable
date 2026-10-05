import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: 'b6f6d501-8b9a-4c2f-a912-70b740eb7631' })
  id: string;

  @ApiProperty({ example: 'admin@crmcontable.com' })
  email: string;

  @ApiProperty({ example: 'Administrador' })
  nombres: string;

  @ApiProperty({ example: 'Principal' })
  apellidos: string;

  @ApiProperty({ example: 'ADMIN' })
  rol: string;

  @ApiProperty({ example: ['ventas.crear', 'ventas.consultar', 'usuarios.gestionar'] })
  permisos: string[];
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Bearer Access Token para autorización de endpoints',
  })
  accessToken: string;

  @ApiProperty({
    example: 'Bearer',
    description: 'Tipo de token',
  })
  tokenType: string;

  @ApiProperty({
    example: 900,
    description: 'Tiempo de vida del token en segundos (15m)',
  })
  expiresIn: number;

  @ApiProperty({ type: () => UserProfileDto })
  user: UserProfileDto;
}
