import { prepararPasswordConPepper } from './pepper';

describe('prepararPasswordConPepper (OWASP Top 10 A04:2025 / C2)', () => {
  it('debe generar un HMAC consistente para una misma contraseña y pepper', () => {
    const p1 = prepararPasswordConPepper('claveSegura123', 'pepper_secreto');
    const p2 = prepararPasswordConPepper('claveSegura123', 'pepper_secreto');
    expect(p1).toBe(p2);
    expect(p1.length).toBe(64); // SHA-256 hex
  });

  it('debe generar valores distintos para distintos peppers o contraseñas', () => {
    const p1 = prepararPasswordConPepper('claveSegura123', 'pepper_a');
    const p2 = prepararPasswordConPepper('claveSegura123', 'pepper_b');
    const p3 = prepararPasswordConPepper('otraClaveSegura', 'pepper_a');

    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(p3);
  });
});
