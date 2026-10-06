import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Producto } from '../../database/entities/producto.entity';
import {
  RegistrarMovimientoDto,
  AjusteFisicoDto,
  EntradaInventarioDto,
  SalidaInventarioDto,
  TrasladoInventarioDto,
  DevolucionInventarioDto,
  CrearConteoDto,
  CerrarConteoDto,
  ConsultaMovimientosDto,
  ConsultaSaldosDto,
} from './dto/movimiento-inventario.dto';
import {
  ESTADOS_PEDIDO_CON_RESERVA,
  bloquearInventario,
  costoPromedio,
  esEntrada,
  resolverBodega,
  saldoProducto,
  SQL_CANTIDAD_CON_SIGNO,
  validarDisponibilidad,
} from '../../common/inventario/stock';
import { redondear } from '../../common/documentos/totales';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado, paginarArreglo } from '../../common/paginacion/paginacion';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ConsecutivosService } from '../ventas/consecutivos.service';
import { Actor } from '../auth/decorators/actor.decorator';

/** Orígenes de movimientos que se reversan anulando el documento, no a mano. */
const ORIGENES_DE_DOCUMENTO = [
  'facturas_venta',
  'facturas_compra',
  'anulacion_factura_venta',
  'anulacion_factura_compra',
];

type DatosMovimiento = Omit<RegistrarMovimientoDto, 'motivo'> & { motivo: string; origen?: string };

/**
 * Inventario por kardex: el saldo es la suma con signo de los movimientos.
 * Toda operación que mueve stock corre en una transacción con bloqueo de
 * inventario, deja usuario y motivo en el movimiento y respeta los periodos
 * contables cerrados.
 */
@Injectable()
export class InventarioService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    private readonly auditoria: AuditoriaService,
    private readonly consecutivos: ConsecutivosService,
  ) {}

  // ─── Consultas ─────────────────────────────────────────────────────────────

  /** Saldo, reservado y disponible por producto y bodega. */
  async getSaldos(bodegaId?: string, db: EntityManager = this.dataSource.manager): Promise<any[]> {
    const params = [ESTADOS_PEDIDO_CON_RESERVA, bodegaId ?? null];

    const filas = await db.query(
      `
      SELECT s.*, COALESCE(r.reservado, 0) AS reservado
        FROM (
          SELECT p.id_producto AS "idProducto", p.codigo, p.nombre,
                 p.stock_minimo AS "stockMinimo",
                 b.id_bodega AS "idBodega", b.nombre AS "bodegaNombre", b.codigo AS "bodegaCodigo",
                 SUM(${SQL_CANTIDAD_CON_SIGNO}) AS saldo
            FROM movimientos_inventario m
            JOIN productos p ON p.id_producto = m.id_producto
            JOIN bodegas b ON b.id_bodega = m.id_bodega
           WHERE ($2::uuid IS NULL OR m.id_bodega = $2::uuid)
           GROUP BY p.id_producto, p.codigo, p.nombre, p.stock_minimo, b.id_bodega, b.nombre, b.codigo
        ) s
        LEFT JOIN (
          SELECT d.id_producto, pe.id_bodega, SUM(d.cantidad) AS reservado
            FROM detalle_pedido d
            JOIN pedidos pe ON pe.id_pedido = d.id_pedido
           WHERE pe.estado = ANY($1)
           GROUP BY d.id_producto, pe.id_bodega
        ) r ON r.id_producto = s."idProducto" AND r.id_bodega = s."idBodega"
       ORDER BY s.codigo, s."bodegaCodigo"
      `,
      params,
    );

    return filas.map((r: any) => {
      const saldo = Number(r.saldo || 0);
      const reservado = Number(r.reservado || 0);
      return {
        ...r,
        saldo,
        reservado,
        disponible: saldo - reservado,
        stockMinimo: Number(r.stockMinimo || 0),
      };
    });
  }

  async consultarSaldos(filtros: ConsultaSaldosDto) {
    let saldos = await this.getSaldos(filtros.bodegaId);
    if (filtros.search?.trim()) {
      const q = filtros.search.trim().toLowerCase();
      saldos = saldos.filter((s) => s.codigo.toLowerCase().includes(q) || s.nombre.toLowerCase().includes(q));
    }
    return paginarArreglo(saldos, filtros);
  }

  async getMovimientos(filtros: ConsultaMovimientosDto) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.movimientoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.producto', 'p')
      .innerJoinAndSelect('m.bodega', 'b')
      .orderBy('m.fecha', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.productoId) query.andWhere('m.idProducto = :productoId', { productoId: filtros.productoId });
    if (filtros.bodegaId) query.andWhere('m.idBodega = :bodegaId', { bodegaId: filtros.bodegaId });
    if (filtros.fechaDesde) query.andWhere('m.fecha >= :fechaDesde', { fechaDesde: filtros.fechaDesde.slice(0, 10) });
    // fechaHasta es inclusiva: se compara contra el inicio del día siguiente
    if (filtros.fechaHasta) {
      query.andWhere('m.fecha < :fechaTope', { fechaTope: sumarDias(filtros.fechaHasta.slice(0, 10), 1) });
    }

    const [data, total] = await query.getManyAndCount();
    return paginado(data, total, pagina);
  }

  /**
   * Kardex completo del producto en orden cronológico con saldo acumulado.
   * Sin `verCostos` (permiso inventario.costos) no se exponen costos ni valores.
   */
  async getKardexProducto(productoId: string, opciones: { bodegaId?: string; verCostos: boolean }) {
    const [producto] = await this.dataSource.query(
      `SELECT id_producto AS "idProducto", codigo, nombre FROM productos WHERE id_producto = $1`,
      [productoId],
    );
    if (!producto) throw new NotFoundException(`Producto con ID ${productoId} no encontrado`);

    const params = [productoId, opciones.bodegaId ?? null];
    const filas = await this.dataSource.query(
      `SELECT m.id_movimiento AS "id", m.fecha, m.tipo_movimiento AS "tipo", m.cantidad,
              m.costo_unitario AS "costoUnitario", m.origen_tabla AS "origen", m.origen_id AS "origenId",
              m.motivo, b.codigo AS "bodega", NULLIF(TRIM(CONCAT(u.nombres, ' ', u.apellidos)), '') AS "usuario",
              ${SQL_CANTIDAD_CON_SIGNO} AS "cantidadConSigno"
         FROM movimientos_inventario m
         JOIN bodegas b ON b.id_bodega = m.id_bodega
         LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario
        WHERE m.id_producto = $1 AND ($2::uuid IS NULL OR m.id_bodega = $2::uuid)
        ORDER BY m.fecha, m.id_movimiento`,
      params,
    );

    let saldo = 0;
    const movimientos = filas.map((f: any) => {
      const cantidad = Number(f.cantidadConSigno);
      saldo = redondear(saldo + cantidad, 3);
      const fila: Record<string, unknown> = {
        id: f.id,
        fecha: f.fecha,
        tipo: f.tipo,
        bodega: f.bodega,
        entrada: cantidad > 0 ? cantidad : 0,
        salida: cantidad < 0 ? -cantidad : 0,
        saldo,
        origen: f.origen,
        origenId: f.origenId,
        motivo: f.motivo,
        usuario: f.usuario,
      };
      if (opciones.verCostos) {
        fila.costoUnitario = Number(f.costoUnitario || 0);
        fila.valorMovimiento = redondear(cantidad * Number(f.costoUnitario || 0));
      }
      return fila;
    });

    return { producto, saldoFinal: saldo, totalMovimientos: movimientos.length, movimientos };
  }

  async getAlertasStock(): Promise<any[]> {
    const saldos = await this.getSaldos();
    const productos: Record<string, any> = {};

    for (const item of saldos) {
      productos[item.idProducto] ??= {
        idProducto: item.idProducto,
        codigo: item.codigo,
        nombre: item.nombre,
        stockMinimo: item.stockMinimo,
        saldoTotal: 0,
      };
      productos[item.idProducto].saldoTotal += item.saldo;
    }

    // Productos que manejan inventario y nunca han tenido movimientos: saldo 0
    const sinMovimientos = await this.dataSource.query(
      `SELECT p.id_producto AS "idProducto", p.codigo, p.nombre, p.stock_minimo AS "stockMinimo"
         FROM productos p
        WHERE p.activo AND p.maneja_inventario
          AND NOT EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.id_producto = p.id_producto)`,
    );
    for (const p of sinMovimientos) {
      productos[p.idProducto] = { ...p, stockMinimo: Number(p.stockMinimo || 0), saldoTotal: 0 };
    }

    return Object.values(productos)
      .filter((p) => p.saldoTotal <= p.stockMinimo)
      .sort((a, b) => a.saldoTotal - a.stockMinimo - (b.saldoTotal - b.stockMinimo));
  }

  async getSinMovimiento(dias: number = 180): Promise<any[]> {
    const filas = await this.dataSource.query(
      `
      SELECT p.id_producto AS "idProducto", p.codigo, p.nombre,
             SUM(${SQL_CANTIDAD_CON_SIGNO}) AS saldo,
             MAX(m.fecha) AS "ultimoMovimiento",
             EXTRACT(DAY FROM now() - MAX(m.fecha))::int AS "diasInactivo"
        FROM movimientos_inventario m
        JOIN productos p ON p.id_producto = m.id_producto
       GROUP BY p.id_producto, p.codigo, p.nombre
      HAVING MAX(m.fecha) < now() - make_interval(days => $1)
         AND SUM(${SQL_CANTIDAD_CON_SIGNO}) > 0
       ORDER BY MAX(m.fecha) ASC
      `,
      [dias],
    );
    return filas.map((f: any) => ({ ...f, saldo: Number(f.saldo) }));
  }

  async getInventarioValorizado(): Promise<any> {
    const saldos = await this.getSaldos();
    const costos = new Map<string, number>();
    let valorTotalInventario = 0;

    const items = [];
    for (const item of saldos) {
      if (!costos.has(item.idProducto)) {
        costos.set(item.idProducto, await costoPromedio(this.dataSource.manager, item.idProducto));
      }
      const costoUnitario = costos.get(item.idProducto)!;
      const valorTotal = redondear(item.saldo * costoUnitario);
      valorTotalInventario += valorTotal;
      items.push({ ...item, costoUnitario, valorTotal });
    }

    return {
      fechaCorte: new Date().toISOString(),
      metodo: 'Costo promedio ponderado',
      totalArticulos: items.length,
      valorTotalInventario: redondear(valorTotalInventario),
      items,
    };
  }

  async getSaldoPorProducto(productoId: string): Promise<any> {
    const [producto] = await this.dataSource.query(
      'SELECT id_producto, codigo, nombre, stock_minimo FROM productos WHERE id_producto = $1',
      [productoId],
    );
    if (!producto) throw new NotFoundException(`Producto con ID ${productoId} no encontrado`);

    const bodegas = (await this.getSaldos()).filter((s) => s.idProducto === productoId);
    return {
      productoId,
      codigo: producto.codigo,
      nombre: producto.nombre,
      stockMinimo: Number(producto.stock_minimo || 0),
      totalSaldo: redondear(bodegas.reduce((acc, b) => acc + b.saldo, 0), 3),
      totalReservado: redondear(bodegas.reduce((acc, b) => acc + b.reservado, 0), 3),
      totalDisponible: redondear(bodegas.reduce((acc, b) => acc + b.disponible, 0), 3),
      bodegas: bodegas.map((b) => ({
        idBodega: b.idBodega,
        nombre: b.bodegaNombre,
        codigo: b.bodegaCodigo,
        saldo: b.saldo,
        reservado: b.reservado,
        disponible: b.disponible,
      })),
    };
  }

  // ─── Movimientos ───────────────────────────────────────────────────────────

  async registrarEntrada(dto: EntradaInventarioDto, actor: Actor) {
    return this.registrarMovimiento({ ...dto, tipoMovimiento: 'ENTRADA', origen: 'entrada_manual' }, actor);
  }

  async registrarSalida(dto: SalidaInventarioDto, actor: Actor) {
    return this.registrarMovimiento({ ...dto, tipoMovimiento: 'SALIDA', origen: 'salida_manual' }, actor);
  }

  /** Mercancía que regresa a la bodega: entra al costo promedio vigente. */
  async registrarDevolucion(dto: DevolucionInventarioDto, actor: Actor) {
    return this.registrarMovimiento({ ...dto, tipoMovimiento: 'ENTRADA', origen: 'devolucion' }, actor);
  }

  async registrarTraslado(dto: TrasladoInventarioDto, actor: Actor) {
    return this.registrarMovimiento(
      {
        idProducto: dto.idProducto,
        idBodega: dto.idBodegaOrigen,
        idBodegaDestino: dto.idBodegaDestino,
        tipoMovimiento: 'TRASLADO',
        cantidad: dto.cantidad,
        motivo: dto.observacion,
      },
      actor,
    );
  }

  /** Movimiento manual genérico (administrativo). Un TRASLADO hace salida y entrada en la misma transacción. */
  async registrarMovimiento(dto: DatosMovimiento, actor: Actor): Promise<MovimientoInventario | MovimientoInventario[]> {
    return this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fechaHoy(), 'mover inventario');
      await bloquearInventario(manager);
      await this.obtenerProducto(manager, dto.idProducto);
      await resolverBodega(manager, dto.idBodega);

      if (dto.tipoMovimiento === 'TRASLADO') {
        return this.trasladar(manager, dto, actor);
      }

      const entrada = esEntrada(dto.tipoMovimiento);
      if (!entrada) {
        await validarDisponibilidad(manager, [dto], dto.idBodega);
      }

      const costo =
        entrada && dto.costoUnitario !== undefined
          ? dto.costoUnitario
          : await costoPromedio(manager, dto.idProducto);

      return manager.save(
        MovimientoInventario,
        manager.create(MovimientoInventario, {
          idProducto: dto.idProducto,
          idBodega: dto.idBodega,
          tipoMovimiento: dto.tipoMovimiento,
          cantidad: dto.cantidad,
          costoUnitario: costo,
          origenTabla: dto.origen || 'manual',
          idUsuario: actor.id,
          motivo: dto.motivo,
        }),
      );
    });
  }

  private async trasladar(manager: EntityManager, dto: DatosMovimiento, actor: Actor) {
    if (!dto.idBodegaDestino || dto.idBodegaDestino === dto.idBodega) {
      throw new BadRequestException('La bodega de destino debe ser distinta a la de origen');
    }
    await resolverBodega(manager, dto.idBodegaDestino);
    // Un traslado no puede tomar stock reservado por pedidos
    await validarDisponibilidad(manager, [dto], dto.idBodega);

    const costo = await costoPromedio(manager, dto.idProducto);
    const salida = await manager.save(
      MovimientoInventario,
      manager.create(MovimientoInventario, {
        idProducto: dto.idProducto,
        idBodega: dto.idBodega,
        tipoMovimiento: 'TRASLADO_SALIDA',
        cantidad: dto.cantidad,
        costoUnitario: costo,
        origenTabla: 'traslado',
        idUsuario: actor.id,
        motivo: dto.motivo,
      }),
    );
    const entrada = await manager.save(
      MovimientoInventario,
      manager.create(MovimientoInventario, {
        idProducto: dto.idProducto,
        idBodega: dto.idBodegaDestino,
        tipoMovimiento: 'TRASLADO_ENTRADA',
        cantidad: dto.cantidad,
        costoUnitario: costo,
        origenTabla: 'traslado',
        origenId: salida.id,
        idUsuario: actor.id,
        motivo: dto.motivo,
      }),
    );
    return [salida, entrada];
  }

  /** Ajuste por conteo físico: lleva el saldo de la bodega a la cantidad contada. */
  async ajusteFisico(dto: AjusteFisicoDto, actor: Actor): Promise<MovimientoInventario> {
    return this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fechaHoy(), 'ajustar inventario');
      await bloquearInventario(manager);
      await this.obtenerProducto(manager, dto.idProducto);
      await resolverBodega(manager, dto.idBodega);

      const saldoActual = await saldoProducto(manager, dto.idProducto, dto.idBodega);
      const diferencia = redondear(dto.cantidadFisica - saldoActual, 3);

      if (diferencia === 0) {
        throw new UnprocessableEntityException('El saldo físico coincide con el sistema; no requiere ajuste');
      }

      const mov = await manager.save(
        MovimientoInventario,
        manager.create(MovimientoInventario, {
          idProducto: dto.idProducto,
          idBodega: dto.idBodega,
          tipoMovimiento: diferencia > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
          cantidad: Math.abs(diferencia),
          costoUnitario: await costoPromedio(manager, dto.idProducto),
          origenTabla: 'conteo_fisico',
          idUsuario: actor.id,
          motivo: dto.motivo,
        }),
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'AJUSTAR_INVENTARIO',
          recurso: 'movimientos_inventario',
          idRecurso: mov.id,
          valorAnterior: { idProducto: dto.idProducto, idBodega: dto.idBodega, saldo: saldoActual },
          valorNuevo: { saldo: dto.cantidadFisica, diferencia },
          motivo: dto.motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return mov;
    });
  }

  /** Reversa con movimiento compensatorio; el original nunca se borra. */
  async reversarMovimiento(id: string, motivo: string, actor: Actor): Promise<MovimientoInventario> {
    return this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fechaHoy(), 'reversar el movimiento');
      await bloquearInventario(manager);
      const mov = await manager.findOne(MovimientoInventario, { where: { id } });
      if (!mov) throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);

      if (ORIGENES_DE_DOCUMENTO.includes(mov.origenTabla || '')) {
        throw new ConflictException(
          'Este movimiento lo generó un documento. Anule la remisión o la compra correspondiente en lugar de reversarlo',
        );
      }
      if (mov.origenTabla === 'reversa_movimiento') {
        throw new ConflictException('No se puede reversar un movimiento de reversa');
      }
      if (mov.origenTabla === 'traslado') {
        throw new ConflictException('Un traslado se corrige con un traslado en sentido contrario');
      }
      const yaReversado = await manager.count(MovimientoInventario, {
        where: { origenTabla: 'reversa_movimiento', origenId: mov.id },
      });
      if (yaReversado > 0) {
        throw new ConflictException('El movimiento ya fue reversado');
      }

      const entrada = esEntrada(mov.tipoMovimiento);
      if (entrada) {
        // Reversar una entrada saca stock: debe existir
        const saldo = await saldoProducto(manager, mov.idProducto, mov.idBodega);
        if (saldo < Number(mov.cantidad)) {
          throw new ConflictException({
            message: `Stock insuficiente para reversar la entrada. Saldo actual: ${saldo}, cantidad: ${mov.cantidad}`,
            tipo: 'stock-insuficiente',
          });
        }
      }

      const compensatorio = await manager.save(
        MovimientoInventario,
        manager.create(MovimientoInventario, {
          idProducto: mov.idProducto,
          idBodega: mov.idBodega,
          tipoMovimiento: entrada ? 'AJUSTE_SALIDA' : 'AJUSTE_ENTRADA',
          cantidad: mov.cantidad,
          costoUnitario: mov.costoUnitario,
          origenTabla: 'reversa_movimiento',
          origenId: mov.id,
          idUsuario: actor.id,
          motivo,
        }),
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'REVERSAR',
          recurso: 'movimientos_inventario',
          idRecurso: mov.id,
          valorAnterior: { tipo: mov.tipoMovimiento, cantidad: mov.cantidad, idBodega: mov.idBodega },
          valorNuevo: { compensatorio: compensatorio.id, tipo: compensatorio.tipoMovimiento },
          motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return compensatorio;
    });
  }

  // ─── Conteos cíclicos ──────────────────────────────────────────────────────

  async crearConteo(dto: CrearConteoDto, actor: Actor): Promise<any> {
    const id = await this.dataSource.transaction(async (manager) => {
      const [bodega] = await manager.query('SELECT id_bodega, activo FROM bodegas WHERE id_bodega = $1', [dto.idBodega]);
      if (!bodega) throw new NotFoundException('Bodega no encontrada');
      if (!bodega.activo) throw new UnprocessableEntityException('La bodega está inactiva');

      const [abierto] = await manager.query(
        `SELECT numero FROM conteos_inventario WHERE id_bodega = $1 AND estado = 'ABIERTO' FOR UPDATE`,
        [dto.idBodega],
      );
      if (abierto) {
        throw new ConflictException(`La bodega ya tiene el conteo ${abierto.numero} abierto. Ciérrelo antes de abrir otro`);
      }

      const numero = await this.consecutivos.tomar(manager, 'CONTEO');
      const [conteo] = await manager.query(
        `INSERT INTO conteos_inventario (numero, id_bodega, observacion, id_usuario_apertura, estado)
         VALUES ($1, $2, $3, $4, 'ABIERTO')
         RETURNING id_conteo`,
        [numero, dto.idBodega, dto.observacion || null, actor.id],
      );

      // Foto del saldo del sistema al abrir el conteo
      const saldos = await this.getSaldos(dto.idBodega, manager);
      for (const item of saldos) {
        await manager.query(
          `INSERT INTO detalle_conteo_inventario (id_conteo, id_producto, stock_sistema, stock_fisico, diferencia)
           VALUES ($1, $2, $3, $3, 0)`,
          [conteo.id_conteo, item.idProducto, item.saldo],
        );
      }
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ABRIR_CONTEO',
          recurso: 'conteos_inventario',
          idRecurso: conteo.id_conteo,
          valorNuevo: { numero, idBodega: dto.idBodega, productos: saldos.length },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return conteo.id_conteo;
    });
    return this.getConteo(id);
  }

  async getConteo(id: string): Promise<any> {
    const [conteo] = await this.dataSource.query(
      `SELECT c.*, b.nombre AS bodega_nombre, u.nombres AS usuario_apertura
       FROM conteos_inventario c
       JOIN bodegas b ON b.id_bodega = c.id_bodega
       LEFT JOIN usuarios u ON u.id_usuario = c.id_usuario_apertura
       WHERE c.id_conteo = $1`,
      [id],
    );
    if (!conteo) throw new NotFoundException(`Conteo con ID ${id} no encontrado`);

    const items = await this.dataSource.query(
      `SELECT d.*, p.codigo, p.nombre
       FROM detalle_conteo_inventario d
       JOIN productos p ON p.id_producto = d.id_producto
       WHERE d.id_conteo = $1
       ORDER BY p.nombre ASC`,
      [id],
    );

    return { ...conteo, items };
  }

  /**
   * Cierra el conteo y genera los ajustes. La diferencia se calcula contra el
   * saldo vigente al cerrar. Un conteo cerrado no se vuelve a cerrar.
   */
  async cerrarConteo(id: string, dto: CerrarConteoDto, actor: Actor): Promise<any> {
    await this.dataSource.transaction(async (manager) => {
      await validarPeriodoAbierto(manager, fechaHoy(), 'ajustar inventario');
      await bloquearInventario(manager);
      const [conteo] = await manager.query('SELECT * FROM conteos_inventario WHERE id_conteo = $1 FOR UPDATE', [id]);
      if (!conteo) throw new NotFoundException('Conteo no encontrado');
      if (conteo.estado !== 'ABIERTO') {
        throw new ConflictException(`El conteo ya se encuentra ${conteo.estado}`);
      }

      const productosRepetidos = dto.conteosFisicos.length !== new Set(dto.conteosFisicos.map((c) => c.idProducto)).size;
      if (productosRepetidos) throw new BadRequestException('Hay productos repetidos en el conteo');

      const ajustes: Array<{ idProducto: string; sistema: number; fisico: number; diferencia: number }> = [];
      for (const f of dto.conteosFisicos) {
        const producto = await this.obtenerProducto(manager, f.idProducto);
        const sistema = await saldoProducto(manager, f.idProducto, conteo.id_bodega);
        const diferencia = redondear(Number(f.stockFisico) - sistema, 3);

        await manager.query(
          `INSERT INTO detalle_conteo_inventario (id_conteo, id_producto, stock_sistema, stock_fisico, diferencia, ajuste_aplicado)
           SELECT $1, $2, $3, $4, $5, $6
            WHERE NOT EXISTS (SELECT 1 FROM detalle_conteo_inventario WHERE id_conteo = $1 AND id_producto = $2)`,
          [id, f.idProducto, sistema, f.stockFisico, diferencia, diferencia !== 0],
        );
        await manager.query(
          `UPDATE detalle_conteo_inventario
              SET stock_sistema = $3, stock_fisico = $4, diferencia = $5, ajuste_aplicado = $6
            WHERE id_conteo = $1 AND id_producto = $2`,
          [id, f.idProducto, sistema, f.stockFisico, diferencia, diferencia !== 0],
        );

        if (diferencia !== 0) {
          await manager.save(
            MovimientoInventario,
            manager.create(MovimientoInventario, {
              idProducto: f.idProducto,
              idBodega: conteo.id_bodega,
              tipoMovimiento: diferencia > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
              cantidad: Math.abs(diferencia),
              costoUnitario: await costoPromedio(manager, f.idProducto),
              origenTabla: 'conteos_inventario',
              origenId: id,
              idUsuario: actor.id,
              motivo: `Conteo ${conteo.numero}: ${dto.motivo}`,
            }),
          );
          ajustes.push({ idProducto: producto.id, sistema, fisico: Number(f.stockFisico), diferencia });
        }
      }

      await manager.query(
        `UPDATE conteos_inventario
         SET estado = 'CERRADO', fecha_cierre = now(), id_usuario_cierre = $1
         WHERE id_conteo = $2`,
        [actor.id, id],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CERRAR_CONTEO',
          recurso: 'conteos_inventario',
          idRecurso: id,
          valorAnterior: { estado: 'ABIERTO' },
          valorNuevo: { estado: 'CERRADO', ajustes },
          motivo: dto.motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.getConteo(id);
  }

  private async obtenerProducto(manager: EntityManager, id: string): Promise<Producto> {
    const producto = await manager.findOne(Producto, { where: { id } });
    if (!producto) throw new NotFoundException(`Producto ${id} no encontrado`);
    if (!producto.manejaInventario) {
      throw new UnprocessableEntityException(`El producto ${producto.codigo} no maneja inventario`);
    }
    return producto;
  }
}
