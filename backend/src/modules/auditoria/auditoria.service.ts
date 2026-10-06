import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { sanitizeData } from '../../common/middleware/http-logger.middleware';
import { normalizarPaginacion, paginado, PaginacionDto } from '../../common/paginacion/paginacion';

export interface AuditoriaFiltros extends PaginacionDto {
  fechaInicio?: string;
  fechaFin?: string;
  accion?: string;
  recurso?: string;
  resultado?: string;
  idUsuario?: string;
}

export interface RegistroAuditoria {
  idUsuario?: string | null;
  accion: string;
  recurso: string;
  idRecurso?: string | null;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  motivo?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  resultado?: 'EXITOSO' | 'FALLO';
}

/** Acciones que la consulta de anulaciones agrupa. */
const ACCIONES_ANULACION = ['ANULAR', 'REVERSAR', 'CASTIGAR'];
/** Acciones de autenticación para la consulta de accesos. */
const ACCIONES_ACCESO = [
  'LOGIN',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'CAMBIO_PASSWORD',
  'RESET_PASSWORD',
  'SOLICITUD_RESET_PASSWORD',
  'ACCESO_DENEGADO',
];
interface FiltroBitacora {
  fechaInicio: string | null;
  fechaFin: string | null;
  accion: string | null;
  recurso: string | null;
  resultado: string | null;
  idUsuario: string | null;
  recursoExacto: string | null;
  idRecurso: string | null;
  accionesAcceso: string[] | null;
  patronesAccion: string[] | null;
}

const FILTRO_VACIO: FiltroBitacora = {
  fechaInicio: null,
  fechaFin: null,
  accion: null,
  recurso: null,
  resultado: null,
  idUsuario: null,
  recursoExacto: null,
  idRecurso: null,
  accionesAcceso: null,
  patronesAccion: null,
};

/** Filtro fijo de la bitácora: cada condición se desactiva con su parámetro en NULL. */
const SQL_FILTRO_BITACORA = `
      ($1::timestamptz IS NULL OR b.fecha >= $1::timestamptz)
  AND ($2::date IS NULL OR b.fecha < ($2::date + 1))
  AND ($3::varchar IS NULL OR b.accion ILIKE $3)
  AND ($4::varchar IS NULL OR b.recurso ILIKE $4)
  AND ($5::varchar IS NULL OR b.resultado = $5)
  AND ($6::uuid IS NULL OR b.id_usuario = $6::uuid)
  AND ($7::varchar IS NULL OR b.recurso = $7)
  AND ($8::varchar IS NULL OR b.id_recurso::text = $8)
  AND ($9::varchar[] IS NULL OR b.accion = ANY($9) OR b.recurso = 'auth')
  AND ($10::varchar[] IS NULL OR b.accion ILIKE ANY($10))`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANO_MAXIMO_VALOR = 16_000;

/** Reduce un valor para la bitácora: sin secretos y con tamaño acotado. */
export function valorParaBitacora(valor: unknown): unknown {
  if (valor === undefined || valor === null) return null;
  const limpio = sanitizeData(valor);
  const json = JSON.stringify(limpio);
  if (json.length <= TAMANO_MAXIMO_VALOR) return limpio;
  const obj = limpio as Record<string, unknown>;
  return { resumen: 'Valor truncado por tamaño', id: obj?.id ?? obj?.idPedido ?? null };
}

/**
 * Bitácora de auditoría de solo lectura para la API (catálogo §29).
 * Las operaciones sensibles registran usuario, acción, recurso, valores
 * anterior/nuevo, resultado y motivo.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Registra un evento. Con `db` (EntityManager de una transacción) el
   * registro queda dentro de la misma transacción: si falla, falla la
   * operación. Sin `db` el error se registra en el log y no se propaga.
   */
  async registrar(evento: RegistroAuditoria, db?: EntityManager): Promise<void> {
    const sql = `INSERT INTO bitacora_auditoria
        (id_usuario, accion, recurso, id_recurso, valor_anterior, valor_nuevo, motivo, ip_address, user_agent, resultado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
    const anterior = valorParaBitacora(evento.valorAnterior);
    const nuevo = valorParaBitacora(evento.valorNuevo);
    const params = [
      evento.idUsuario || null,
      evento.accion.slice(0, 100),
      evento.recurso.slice(0, 50),
      evento.idRecurso && UUID.test(evento.idRecurso) ? evento.idRecurso : null,
      anterior === null ? null : JSON.stringify(anterior),
      nuevo === null ? null : JSON.stringify(nuevo),
      evento.motivo || null,
      evento.ip?.slice(0, 45) || null,
      evento.userAgent || null,
      evento.resultado || 'EXITOSO',
    ];

    if (db) {
      await db.query(sql, params);
      return;
    }
    try {
      await this.dataSource.query(sql, params);
    } catch (err: any) {
      this.logger.error(`No se pudo registrar en la bitácora (${evento.accion} ${evento.recurso}): ${err.message}`);
    }
  }

  async findAll(filtros: AuditoriaFiltros) {
    return this.consultar(this.filtroDe(filtros), normalizarPaginacion(filtros));
  }

  async findByRecurso(recurso: string, id: string, p: PaginacionDto = {}) {
    return this.consultar({ ...FILTRO_VACIO, recursoExacto: recurso, idRecurso: id }, normalizarPaginacion(p));
  }

  async findByUsuario(usuarioId: string, p: PaginacionDto = {}) {
    return this.consultar({ ...FILTRO_VACIO, idUsuario: usuarioId }, normalizarPaginacion(p));
  }

  async findAnulaciones(p: PaginacionDto = {}) {
    const patrones = ACCIONES_ANULACION.map((a) => `%${a}%`);
    return this.consultar({ ...FILTRO_VACIO, patronesAccion: patrones }, normalizarPaginacion(p));
  }

  async findAccesos(p: PaginacionDto & { resultado?: string } = {}) {
    return this.consultar(
      { ...FILTRO_VACIO, accionesAcceso: ACCIONES_ACCESO, resultado: p.resultado?.toUpperCase() ?? null },
      normalizarPaginacion(p),
    );
  }

  /** Filas para exportación (sin paginar, con tope de seguridad). */
  async filasExportacion(filtros: AuditoriaFiltros, tope = 50_000) {
    const filtro = this.filtroDe(filtros);
    const filas: any[] = [];
    for (let offset = 0; offset < tope; offset += 1000) {
      const lote = await this.consultar(filtro, { page: 1, limit: 1000, offset });
      filas.push(...lote.data);
      if (lote.data.length < 1000) break;
    }
    return filas;
  }

  private filtroDe(filtros: AuditoriaFiltros): FiltroBitacora {
    return {
      ...FILTRO_VACIO,
      fechaInicio: filtros.fechaInicio ?? null,
      fechaFin: filtros.fechaFin?.slice(0, 10) ?? null,
      accion: filtros.accion ? `%${filtros.accion}%` : null,
      recurso: filtros.recurso ? `%${filtros.recurso}%` : null,
      resultado: filtros.resultado?.toUpperCase() ?? null,
      idUsuario: filtros.idUsuario ?? null,
    };
  }

  /** Una sola consulta fija; cada filtro es un parámetro opcional (GEMINI.md §4.5). */
  private async consultar(f: FiltroBitacora, pagina: { page: number; limit: number; offset: number }) {
    const params = [
      f.fechaInicio,
      f.fechaFin,
      f.accion,
      f.recurso,
      f.resultado,
      f.idUsuario,
      f.recursoExacto,
      f.idRecurso,
      f.accionesAcceso,
      f.patronesAccion,
    ];
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM bitacora_auditoria b WHERE ${SQL_FILTRO_BITACORA}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT b.id_auditoria AS "id", b.fecha, b.id_usuario AS "idUsuario",
              NULLIF(TRIM(CONCAT(u.nombres, ' ', u.apellidos)), '') AS "usuario", u.email AS "email",
              b.accion, b.recurso, b.id_recurso AS "idRecurso",
              b.valor_anterior AS "valorAnterior", b.valor_nuevo AS "valorNuevo",
              b.motivo, b.resultado, b.ip_address AS "ip", b.user_agent AS "userAgent"
         FROM bitacora_auditoria b
         LEFT JOIN usuarios u ON u.id_usuario = b.id_usuario
        WHERE ${SQL_FILTRO_BITACORA}
        ORDER BY b.fecha DESC
        LIMIT $11 OFFSET $12`,
      [...params, pagina.limit, pagina.offset],
    );
    return paginado(data, total, pagina);
  }
}
