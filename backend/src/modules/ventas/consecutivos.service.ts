import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

/**
 * Consecutivos internos de documentos. Las ventas se emiten como REMISIONES:
 * su numeración no depende de una resolución DIAN (fuera de alcance).
 *
 *  - REMISION y CONTEO: tabla consecutivos_config (prefijo + siguiente número).
 *  - COTIZACION y PEDIDO: secuencias de PostgreSQL seq_cotizaciones / seq_pedidos.
 */
type TipoConsecutivo = 'REMISION' | 'CONTEO' | 'COTIZACION' | 'PEDIDO';

/**
 * Cada tipo trae sus consultas escritas completas (GEMINI §4.5: ningún
 * identificador ni valor se concatena en el SQL; solo parámetros $n).
 */
interface DefinicionConsecutivo {
  origen: 'config' | 'secuencia';
  /** Nombre de la secuencia (solo se usa como parámetro ::regclass) */
  secuencia?: string;
  prefijoFijo?: string;
  digitos: number;
  /** SELECT last_value, is_called de la secuencia */
  sqlSecuencia?: string;
  /** $1 = número completo */
  sqlExiste: string;
  /** $1 = patrón 'PREFIJO-%' */
  sqlMaximo: string;
  /** $1 = patrón 'PREFIJO-%' */
  sqlEmitidos: string;
}

const DEFINICIONES: Record<TipoConsecutivo, DefinicionConsecutivo> = {
  REMISION: {
    origen: 'config',
    digitos: 6,
    sqlExiste: `SELECT 1 FROM facturas_venta WHERE numero_venta = $1 LIMIT 1`,
    sqlMaximo: `SELECT COALESCE(MAX(CAST(substring(numero_venta FROM '([0-9]+)$') AS BIGINT)), 0) AS maximo
                  FROM facturas_venta WHERE numero_venta LIKE $1`,
    sqlEmitidos: `SELECT COUNT(*)::int AS emitidos FROM facturas_venta WHERE numero_venta LIKE $1`,
  },
  CONTEO: {
    origen: 'config',
    digitos: 6,
    sqlExiste: `SELECT 1 FROM conteos_inventario WHERE numero = $1 LIMIT 1`,
    sqlMaximo: `SELECT COALESCE(MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)), 0) AS maximo
                  FROM conteos_inventario WHERE numero LIKE $1`,
    sqlEmitidos: `SELECT COUNT(*)::int AS emitidos FROM conteos_inventario WHERE numero LIKE $1`,
  },
  COTIZACION: {
    origen: 'secuencia',
    secuencia: 'seq_cotizaciones',
    prefijoFijo: 'COT',
    digitos: 5,
    sqlSecuencia: `SELECT last_value, is_called FROM seq_cotizaciones`,
    sqlExiste: `SELECT 1 FROM cotizaciones WHERE numero = $1 LIMIT 1`,
    sqlMaximo: `SELECT COALESCE(MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)), 0) AS maximo
                  FROM cotizaciones WHERE numero LIKE $1`,
    sqlEmitidos: `SELECT COUNT(*)::int AS emitidos FROM cotizaciones WHERE numero LIKE $1`,
  },
  PEDIDO: {
    origen: 'secuencia',
    secuencia: 'seq_pedidos',
    prefijoFijo: 'PED',
    digitos: 5,
    sqlSecuencia: `SELECT last_value, is_called FROM seq_pedidos`,
    sqlExiste: `SELECT 1 FROM pedidos WHERE numero = $1 LIMIT 1`,
    sqlMaximo: `SELECT COALESCE(MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)), 0) AS maximo
                  FROM pedidos WHERE numero LIKE $1`,
    sqlEmitidos: `SELECT COUNT(*)::int AS emitidos FROM pedidos WHERE numero LIKE $1`,
  },
};

export const TIPOS_CONSECUTIVO = Object.keys(DEFINICIONES) as TipoConsecutivo[];

const formatear = (prefijo: string, numero: number, digitos: number) =>
  `${prefijo}-${String(numero).padStart(digitos, '0')}`;

@Injectable()
export class ConsecutivosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Toma el siguiente número de un consecutivo de configuración dentro de la
   * transacción del documento. La fila queda bloqueada hasta el COMMIT, así
   * dos documentos simultáneos nunca reciben el mismo número; si la
   * transacción se revierte, el número no se consume.
   */
  async tomar(manager: EntityManager, tipo: 'REMISION' | 'CONTEO'): Promise<string> {
    const def = DEFINICIONES[tipo];
    const [fila] = await manager.query(
      `SELECT prefijo, siguiente_numero FROM consecutivos_config WHERE tipo = $1 FOR UPDATE`,
      [tipo],
    );
    if (!fila) {
      throw new InternalServerErrorException(`Falta el consecutivo ${tipo} en consecutivos_config. Ejecute las migraciones`);
    }

    let numero = Number(fila.siguiente_numero);
    let documento = formatear(fila.prefijo, numero, def.digitos);
    // Si un ajuste manual dejó el consecutivo sobre números ya usados, se salta hasta uno libre
    for (let intentos = 0; await this.existe(manager, def, documento); intentos++) {
      if (intentos > 10_000) throw new ConflictException(`No hay números libres para el consecutivo ${tipo}`);
      numero++;
      documento = formatear(fila.prefijo, numero, def.digitos);
    }

    await manager.query(
      `UPDATE consecutivos_config SET siguiente_numero = $2, actualizado_en = now() WHERE tipo = $1`,
      [tipo, numero + 1],
    );
    return documento;
  }

  /** Número que recibirá el próximo documento (sin consumirlo). */
  async siguiente(tipo: TipoConsecutivo) {
    const def = DEFINICIONES[tipo];
    if (def.origen === 'config') {
      const [fila] = await this.dataSource.query(
        `SELECT prefijo, siguiente_numero FROM consecutivos_config WHERE tipo = $1`,
        [tipo],
      );
      if (!fila) throw new NotFoundException(`Consecutivo ${tipo} no configurado`);
      return {
        tipo,
        prefijo: fila.prefijo,
        siguiente: Number(fila.siguiente_numero),
        siguienteNumero: formatear(fila.prefijo, Number(fila.siguiente_numero), def.digitos),
      };
    }
    const [fila] = await this.dataSource.query(def.sqlSecuencia!);
    const siguiente = fila?.is_called ? Number(fila.last_value) + 1 : Number(fila?.last_value || 1);
    return {
      tipo,
      prefijo: def.prefijoFijo,
      siguiente,
      siguienteNumero: formatear(def.prefijoFijo!, siguiente, def.digitos),
    };
  }

  async listar() {
    const resultado = [];
    for (const tipo of TIPOS_CONSECUTIVO) {
      const actual = await this.siguiente(tipo);
      const def = DEFINICIONES[tipo];
      const [{ emitidos }] = await this.dataSource.query(def.sqlEmitidos, [`${actual.prefijo}-%`]);
      resultado.push({
        ...actual,
        ultimoUsado: await this.maximoUsado(this.dataSource.manager, def, actual.prefijo!),
        documentosEmitidos: emitidos,
        prefijoEditable: def.origen === 'config',
      });
    }
    return resultado;
  }

  /**
   * Ajusta prefijo o siguiente número. No se permite retroceder por debajo de
   * un número ya emitido (generaría duplicados). Siempre queda auditado.
   */
  async ajustar(tipoTexto: string, cambios: { prefijo?: string; siguiente?: number; motivo: string }, actor: Actor) {
    const tipo = tipoTexto.toUpperCase() as TipoConsecutivo;
    const def = DEFINICIONES[tipo];
    if (!def) {
      throw new NotFoundException(`Consecutivo ${tipoTexto} no existe. Tipos: ${TIPOS_CONSECUTIVO.join(', ')}`);
    }
    if (cambios.prefijo !== undefined && def.origen !== 'config') {
      throw new BadRequestException(`El prefijo de ${tipo} es fijo (${def.prefijoFijo})`);
    }
    if (cambios.prefijo === undefined && cambios.siguiente === undefined) {
      throw new BadRequestException('Indique prefijo o siguiente');
    }

    return this.dataSource.transaction(async (manager) => {
      const anterior = await this.siguiente(tipo);
      if (def.origen === 'config') {
        await manager.query(`SELECT 1 FROM consecutivos_config WHERE tipo = $1 FOR UPDATE`, [tipo]);
      }
      const prefijo = cambios.prefijo ?? anterior.prefijo!;
      const siguiente = cambios.siguiente ?? anterior.siguiente;

      const maximo = await this.maximoUsado(manager, def, prefijo);
      if (siguiente <= maximo) {
        throw new ConflictException({
          message: `El siguiente número de ${tipo} debe ser mayor que ${maximo}, el último ya emitido con el prefijo ${prefijo}`,
          tipo: 'consecutivo-retrocede',
        });
      }

      if (def.origen === 'config') {
        await manager.query(
          `UPDATE consecutivos_config SET prefijo = $2, siguiente_numero = $3, actualizado_en = now() WHERE tipo = $1`,
          [tipo, prefijo, siguiente],
        );
      } else {
        await manager.query(`SELECT setval($1::regclass, $2, false)`, [def.secuencia, siguiente]);
      }

      const nuevo = { tipo, prefijo, siguiente, siguienteNumero: formatear(prefijo, siguiente, def.digitos) };
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'AJUSTAR_CONSECUTIVO',
          recurso: 'consecutivos_config',
          valorAnterior: anterior,
          valorNuevo: nuevo,
          motivo: cambios.motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return nuevo;
    });
  }

  private async existe(manager: EntityManager, def: DefinicionConsecutivo, numero: string): Promise<boolean> {
    const [fila] = await manager.query(def.sqlExiste, [numero]);
    return !!fila;
  }

  private async maximoUsado(manager: EntityManager, def: DefinicionConsecutivo, prefijo: string): Promise<number> {
    const [fila] = await manager.query(def.sqlMaximo, [`${prefijo}-%`]);
    return Number(fila?.maximo || 0);
  }
}
