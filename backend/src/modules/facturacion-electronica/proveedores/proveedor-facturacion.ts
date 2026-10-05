import { NotImplementedException } from '@nestjs/common';
import { DocumentoElectronico } from '../ubl/xml-ubl';

export const PROVEEDOR_FACTURACION = Symbol('PROVEEDOR_FACTURACION');

export interface ResultadoEnvio {
  estado: 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA';
  /** CUFE devuelto por el proveedor (puede diferir del calculado localmente) */
  cufe?: string;
  mensaje: string;
  /** Respuesta cruda del proveedor o de la DIAN, para auditoría */
  respuesta?: unknown;
}

/**
 * Contrato que debe cumplir cualquier forma de emitir la factura electrónica:
 * un proveedor tecnológico por API o el web service de la DIAN directo.
 * Para agregar uno nuevo, implemente esta interfaz y regístrelo en
 * facturacion-electronica.module.ts según FACTURACION_PROVEEDOR.
 */
export interface ProveedorFacturacion {
  readonly nombre: string;
  enviar(documento: DocumentoElectronico, xmlSinFirma: string): Promise<ResultadoEnvio>;
}

/** Proveedor por defecto: no hay integración configurada. */
export class ProveedorNoConfigurado implements ProveedorFacturacion {
  readonly nombre = 'ninguno';

  async enviar(): Promise<ResultadoEnvio> {
    throw new NotImplementedException(
      'No hay un proveedor de facturación electrónica configurado (FACTURACION_PROVEEDOR). ' +
        'El XML UBL se puede generar, pero no enviar a la DIAN',
    );
  }
}
