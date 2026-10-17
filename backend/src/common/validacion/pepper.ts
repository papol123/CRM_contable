import * as crypto from 'crypto';

/**
 * Prepara la contraseña aplicando un Pepper criptográfico global mediante HMAC-SHA256
 * antes del almacenamiento o verificación con bcrypt (OWASP Top 10 A04:2025 / NIST SP 800-63B).
 *
 * El Pepper es un secreto almacenado fuera de la base de datos (Secret Manager / variable de entorno)
 * que protege los hashes contra ataques de fuerza bruta offline con GPU si la base de datos es filtrada.
 */
export function prepararPasswordConPepper(password: string, pepper?: string): string {
  const secreto = pepper || process.env.PASSWORD_PEPPER || process.env.JWT_SECRET || 'crm_contable_default_pepper_key';
  return crypto.createHmac('sha256', secreto).update(password).digest('hex');
}
