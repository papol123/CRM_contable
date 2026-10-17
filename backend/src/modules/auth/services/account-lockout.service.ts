import { Injectable, Logger } from '@nestjs/common';

export interface EstadoBloqueo {
  intentos: number;
  primerFallo: number;
  bloqueadoHasta?: number;
}

/**
 * Servicio de Bloqueo Temporal de Cuentas (Account Lockout)
 * Mitigación contra ataques de fuerza bruta y Credential Stuffing (MITRE ATT&CK T1110 / OWASP API4:2023).
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);
  private readonly intentosPorCuenta = new Map<string, EstadoBloqueo>();

  readonly MAX_INTENTOS = 5;
  readonly TIEMPO_VENTANA_MS = 15 * 60 * 1000; // 15 minutos de ventana para contabilizar fallos
  readonly TIEMPO_BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos de bloqueo temporal

  constructor() {
    // Limpieza periódica de registros obsoletos cada 10 minutos
    const timer = setInterval(() => this.limpiarExpirados(), 10 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  /**
   * Verifica si la cuenta asociada al email se encuentra bloqueada por exceso de intentos fallidos.
   */
  estaBloqueado(email: string): { bloqueado: boolean; minutosRestantes: number } {
    const clave = email.toLowerCase().trim();
    const estado = this.intentosPorCuenta.get(clave);

    if (!estado || !estado.bloqueadoHasta) {
      return { bloqueado: false, minutosRestantes: 0 };
    }

    const ahora = Date.now();
    if (ahora >= estado.bloqueadoHasta) {
      // El bloqueo ya expiró
      this.intentosPorCuenta.delete(clave);
      return { bloqueado: false, minutosRestantes: 0 };
    }

    const minutosRestantes = Math.ceil((estado.bloqueadoHasta - ahora) / 60000);
    return { bloqueado: true, minutosRestantes };
  }

  /**
   * Registra un intento de login fallido. Si se alcanza el umbral, bloquea la cuenta.
   */
  registrarIntentoFallido(email: string): { bloqueado: boolean; intentosRestantes: number } {
    const clave = email.toLowerCase().trim();
    const ahora = Date.now();
    let estado = this.intentosPorCuenta.get(clave);

    if (!estado || ahora - estado.primerFallo > this.TIEMPO_VENTANA_MS) {
      estado = { intentos: 1, primerFallo: ahora };
      this.intentosPorCuenta.set(clave, estado);
      return { bloqueado: false, intentosRestantes: this.MAX_INTENTOS - 1 };
    }

    estado.intentos += 1;

    if (estado.intentos >= this.MAX_INTENTOS) {
      estado.bloqueadoHasta = ahora + this.TIEMPO_BLOQUEO_MS;
      this.logger.warn(
        `Cuenta ${clave} bloqueada temporalmente por ${this.TIEMPO_BLOQUEO_MS / 60000} minutos tras ${estado.intentos} intentos fallidos (MITRE ATT&CK T1110)`,
      );
      return { bloqueado: true, intentosRestantes: 0 };
    }

    return { bloqueado: false, intentosRestantes: this.MAX_INTENTOS - estado.intentos };
  }

  /**
   * Restablece los intentos fallidos tras un inicio de sesión exitoso.
   */
  limpiarIntentos(email: string): void {
    const clave = email.toLowerCase().trim();
    this.intentosPorCuenta.delete(clave);
  }

  private limpiarExpirados(): void {
    const ahora = Date.now();
    for (const [clave, estado] of this.intentosPorCuenta.entries()) {
      if (estado.bloqueadoHasta && ahora >= estado.bloqueadoHasta) {
        this.intentosPorCuenta.delete(clave);
      } else if (!estado.bloqueadoHasta && ahora - estado.primerFallo > this.TIEMPO_VENTANA_MS) {
        this.intentosPorCuenta.delete(clave);
      }
    }
  }
}
