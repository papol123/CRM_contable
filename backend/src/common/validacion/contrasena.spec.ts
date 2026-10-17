import { validate } from 'class-validator';
import { ContrasenaSegura } from './contrasena';

class DtoSinMfa {
  @ContrasenaSegura(false)
  password: string;

  constructor(password: string) {
    this.password = password;
  }
}

class DtoConMfa {
  @ContrasenaSegura(true)
  password: string;

  constructor(password: string) {
    this.password = password;
  }
}

describe('ContrasenaSegura (NIST SP 800-63B & OWASP A07:2025)', () => {
  describe('Políticas sin MFA (Longitud mínima 15 caracteres)', () => {

    it('debe rechazar contraseñas de menos de 15 caracteres', async () => {
      const dto = new DtoSinMfa('Corta12345*'); // 11 chars
      const errores = await validate(dto);
      expect(errores.length).toBeGreaterThan(0);
      expect(errores[0].constraints?.minLength).toContain('al menos 15 caracteres');
    });

    it('debe aceptar frases de paso seguras sin reglas complejas arbitrarias (con espacios y caracteres válidos)', async () => {
      // Frase de paso larga con espacios, sin forzar mayúsculas o símbolos arbitrarios
      const dto = new DtoSinMfa('esta es una frase de paso muy segura para mi cuenta');
      const errores = await validate(dto);
      expect(errores.length).toBe(0);
    });

    it('debe aceptar caracteres Unicode y acentos sin restricciones innecesarias', async () => {
      const dto = new DtoSinMfa('repuesto-automotriz-año-2026-bogotá');
      const errores = await validate(dto);
      expect(errores.length).toBe(0);
    });

    it('debe rechazar contraseñas triviales o comprometidas', async () => {
      const dto = new DtoSinMfa('123456789012345');
      const errores = await validate(dto);
      expect(errores.length).toBeGreaterThan(0);
      expect(errores[0].constraints?.noEsContrasenaTrivial).toBeDefined();
    });

    it('debe rechazar contraseñas con caracteres repetitivos', async () => {
      const dto = new DtoSinMfa('aaaaaaaaaaaaaaaa'); // 16 repeticiones
      const errores = await validate(dto);
      expect(errores.length).toBeGreaterThan(0);
      expect(errores[0].constraints?.noEsContrasenaTrivial).toBeDefined();
    });
  });

  describe('Políticas con MFA habilitado (Longitud mínima 8 caracteres)', () => {
    it('debe aceptar contraseñas de 8 o más caracteres cuando MFA está activo', async () => {
      const dto = new DtoConMfa('mfaClave8');
      const errores = await validate(dto);
      expect(errores.length).toBe(0);
    });

    it('debe rechazar contraseñas de menos de 8 caracteres aún con MFA', async () => {
      const dto = new DtoConMfa('corta1');
      const errores = await validate(dto);
      expect(errores.length).toBeGreaterThan(0);
    });
  });
});
