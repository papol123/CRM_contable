import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

const API = 'https://sqladmin.googleapis.com/v1';
const ESPERA_MAXIMA_MS = 15 * 60 * 1000;

/**
 * Respaldos bajo demanda de la instancia Cloud SQL mediante la API de
 * administración (backupRuns). Usa las credenciales por defecto de la
 * aplicación: la cuenta de servicio de Cloud Run necesita el rol
 * roles/cloudsql.editor (o cloudsql.admin) sobre la instancia.
 */
@Injectable()
export class CloudSqlBackups {
  private readonly proyecto?: string;
  private readonly instancia?: string;
  private auth?: GoogleAuth;

  constructor(config: ConfigService) {
    const proyecto = config.get<string>('GCP_PROJECT_ID');
    this.proyecto = proyecto && !proyecto.startsWith('tu-') ? proyecto : undefined;
    this.instancia = config.get<string>('CLOUD_SQL_INSTANCE') || undefined;
  }

  get configurado(): boolean {
    return !!this.proyecto && !!this.instancia;
  }

  get destino() {
    return this.configurado ? `${this.proyecto}/${this.instancia}` : null;
  }

  exigirConfiguracion() {
    if (!this.configurado) {
      throw new ServiceUnavailableException(
        'Los respaldos de Cloud SQL no están configurados: defina GCP_PROJECT_ID y CLOUD_SQL_INSTANCE',
      );
    }
  }

  private async cliente() {
    this.auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/sqlservice.admin'] });
    return this.auth.getClient();
  }

  private url(ruta: string) {
    return `${API}/projects/${encodeURIComponent(this.proyecto!)}/instances/${encodeURIComponent(this.instancia!)}${ruta}`;
  }

  async listar(maximo = 30) {
    this.exigirConfiguracion();
    const cliente = await this.cliente();
    const res = await cliente.request<{ items?: any[] }>({ url: this.url(`/backupRuns?maxResults=${maximo}`) });
    return (res.data.items || []).map((b) => ({
      id: b.id,
      tipo: b.type,
      estado: b.status,
      descripcion: b.description,
      inicio: b.startTime,
      fin: b.endTime,
      ubicacion: b.location,
      error: b.error?.message,
    }));
  }

  /** Crea un respaldo y espera a que la operación termine. */
  async ejecutar(descripcion: string) {
    this.exigirConfiguracion();
    const cliente = await this.cliente();
    const { data: operacion } = await cliente.request<{ name: string; status: string }>({
      url: this.url('/backupRuns'),
      method: 'POST',
      data: { description: descripcion.slice(0, 200) },
    });

    const inicio = Date.now();
    let estado = operacion;
    while (estado.status !== 'DONE') {
      if (Date.now() - inicio > ESPERA_MAXIMA_MS) {
        throw new Error(`El respaldo sigue en curso tras 15 minutos (operación ${operacion.name})`);
      }
      await new Promise((r) => setTimeout(r, 5000));
      ({ data: estado } = await cliente.request<{ name: string; status: string; error?: any }>({
        url: `${API}/projects/${encodeURIComponent(this.proyecto!)}/operations/${encodeURIComponent(operacion.name)}`,
      }));
    }
    const error = (estado as any).error?.errors?.[0]?.message;
    if (error) throw new Error(`Cloud SQL rechazó el respaldo: ${error}`);
    return { operacion: operacion.name, destino: this.destino };
  }
}
