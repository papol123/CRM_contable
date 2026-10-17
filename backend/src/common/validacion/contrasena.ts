import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Lista de contraseñas y patrones comunes prohibidos según NIST SP 800-63B.
 */
const CONTRASENAS_TRIVIALES = new Set([
  '123456789012345',
  'password1234567',
  'contraseñasegura',
  'administrador12',
  'qwertyuiopasdfg',
  'admin1234567890',
]);

/**
 * Validador que rechaza contraseñas triviales, repetitivas o comprometidas.
 */
export function NoEsContrasenaTrivial(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (target: Object, propertyKey: string | symbol) {
    registerDecorator({
      name: 'noEsContrasenaTrivial',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const normalizado = value.trim().toLowerCase();
          if (CONTRASENAS_TRIVIALES.has(normalizado)) return false;
          // Rechazar contraseñas compuestas de un único caracter repetido
          if (/^(.)\1+$/.test(value)) return false;
          return true;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'La contraseña es demasiado predecible o forma parte de listas de contraseñas comprometidas (NIST SP 800-63B)';
        },
      },
    });
  };
}

/**
 * Política de contraseñas según NIST SP 800-63B y OWASP Top 10 A07:2025:
 * - Sin MFA: Mínimo 15 caracteres (o 8 con MFA habilitado / pruebas).
 * - Máximo: 128 caracteres (ampliamente superior a los 64 mínimos requeridos).
 * - Soporte total para caracteres Unicode (espacios en blanco, tildes, caracteres especiales y emojis).
 * - Eliminación de reglas complejas arbitrarias (no fuerza combinación obligatoria de mayúsculas/símbolos).
 * - Verificación contra contraseñas triviales / comprometidas.
 */
export const ContrasenaSegura = (conMfa = false) => {
  const minLength = conMfa ? 8 : 15;
  return applyDecorators(
    IsString({ message: 'La contraseña debe ser una cadena de texto' }),
    MinLength(minLength, {
      message: `La contraseña debe tener al menos ${minLength} caracteres (NIST SP 800-63B)`,
    }),
    MaxLength(128, { message: 'La contraseña no puede superar 128 caracteres' }),
    NoEsContrasenaTrivial(),
  );
};
