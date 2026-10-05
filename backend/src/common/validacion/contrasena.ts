import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Política mínima de contraseñas: 8 a 72 caracteres (límite de bcrypt) con letras y números. */
export const ContrasenaSegura = () =>
  applyDecorators(
    IsString({ message: 'La contraseña debe ser una cadena de texto' }),
    MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
    MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres' }),
    Matches(/^(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ])(?=.*\d).+$/, {
      message: 'La contraseña debe combinar letras y números',
    }),
  );
