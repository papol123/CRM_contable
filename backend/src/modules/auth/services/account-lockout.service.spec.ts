import { AccountLockoutService } from './account-lockout.service';

describe('AccountLockoutService (MITRE ATT&CK T1110 / OWASP API4:2023)', () => {
  let service: AccountLockoutService;

  beforeEach(() => {
    service = new AccountLockoutService();
  });

  it('inicialmente la cuenta no debe estar bloqueada', () => {
    const estado = service.estaBloqueado('usuario@crmcontable.com');
    expect(estado.bloqueado).toBe(false);
    expect(estado.minutosRestantes).toBe(0);
  });

  it('debe bloquear la cuenta tras 5 intentos fallidos consecutivos', () => {
    const email = 'victima@crmcontable.com';

    for (let i = 1; i <= 4; i++) {
      const res = service.registrarIntentoFallido(email);
      expect(res.bloqueado).toBe(false);
      expect(res.intentosRestantes).toBe(5 - i);
    }

    // Quinto intento
    const quinto = service.registrarIntentoFallido(email);
    expect(quinto.bloqueado).toBe(true);
    expect(quinto.intentosRestantes).toBe(0);

    const verificacion = service.estaBloqueado(email);
    expect(verificacion.bloqueado).toBe(true);
    expect(verificacion.minutosRestantes).toBeGreaterThanOrEqual(14);
  });

  it('debe limpiar los intentos fallidos al iniciar sesión exitosamente', () => {
    const email = 'usuario@crmcontable.com';
    service.registrarIntentoFallido(email);
    service.registrarIntentoFallido(email);

    service.limpiarIntentos(email);

    const estado = service.estaBloqueado(email);
    expect(estado.bloqueado).toBe(false);

    // Un nuevo intento empieza desde 1 fallo
    const nuevo = service.registrarIntentoFallido(email);
    expect(nuevo.intentosRestantes).toBe(4);
  });
});
