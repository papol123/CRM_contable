import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Producto } from '../../database/entities/producto.entity';
import { RegistrarMovimientoDto, AjusteFisicoDto } from './dto/movimiento-inventario.dto';
import {
  ESTADOS_PEDIDO_CON_RESERVA,
  bloquearInventario,
  costoPromedio,
  esEntrada,
  resolverBodega,
  saldoProducto,
  sqlCantidadConSigno,
  validarDisponibilidad,
} from '../../common/inventario/stock';
import { redondear } from '../../common/documentos/totales';
import { sumarDias } from '../../common/utils/fechas';

/** Orígenes de movimientos que se reversan anulando el documento, no a mano. */
const ORIGENES_DE_DOCUMENTO = [
  'facturas_venta',
  'facturas_compra',
  'anulacion_factura_venta',
  'anulacion_factura_compra',
];

@Injectable()
export class InventarioService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
  ) {}

  async getSaldos(bodegaId?: string): Promise<any[]> {
    const params: any[] = [ESTADOS_PEDIDO_CON_RESERVA];
    let filtro = '';
    if (bodegaId) {
      params.push(bodegaId);
      filtro = 'WHERE m.id_bodega = $2';
    }

    const filas = await this.dataSource.query(
      `
      SELECT s.*, COALESCE(r.reservado, 0) AS reservado
        FROM (
          SELECT p.id_producto AS "idProducto", p.codigo, p.nombre,
                 p.stock_minimo AS "stockMinimo",
                 b.id_bodega AS "idBodega", b.nombre AS "bodegaNombre", b.codigo AS "bodegaCodigo",
                 SUM(${sqlCantidadConSigno('m')}) AS saldo
            FROM movimientos_inventario m
            JOIN productos p ON p.id_producto = m.id_producto
            JOIN bodegas b ON b.id_bodega = m.id_bodega
            ${filtro}
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

  async getMovimientos(
    productoId?: string,
    bodegaId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoInventario[]> {
    const query = this.movimientoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.producto', 'p')
      .innerJoinAndSelect('m.bodega', 'b')
      .orderBy('m.fecha', 'DESC');

    if (productoId) query.andWhere('m.idProducto = :productoId', { productoId });
    if (bodegaId) query.andWhere('m.idBodega = :bodegaId', { bodegaId });
    if (fechaDesde) query.andWhere('m.fecha >= :fechaDesde', { fechaDesde });
    // fechaHasta es inclusiva: se compara contra el inicio del día siguiente
    if (fechaHasta) {
      query.andWhere('m.fecha < :fechaTope', { fechaTope: sumarDias(fechaHasta.slice(0, 10), 1) });
    }

    return query.take(500).getMany();
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
             SUM(${sqlCantidadConSigno('m')}) AS saldo,
             MAX(m.fecha) AS "ultimoMovimiento",
             EXTRACT(DAY FROM now() - MAX(m.fecha))::int AS "diasInactivo"
        FROM movimientos_inventario m
        JOIN productos p ON p.id_producto = m.id_producto
       GROUP BY p.id_producto, p.codigo, p.nombre
      HAVING MAX(m.fecha) < now() - make_interval(days => $1)
         AND SUM(${sqlCantidadConSigno('m')}) > 0
       ORDER BY MAX(m.fecha) ASC
      `,
      [dias],
    );
    return filas.map((f: any) => ({ ...f, saldo: Number(f.saldo) }));
  }

  async registrarMovimiento(dto: RegistrarMovimientoDto): Promise<MovimientoInventario | MovimientoInventario[]> {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);
      await this.obtenerProducto(manager, dto.idProducto);
      await resolverBodega(manager, dto.idBodega);

      if (dto.tipoMovimiento === 'TRASLADO') {
        return this.trasladar(manager, dto);
      }

      const entrada = esEntrada(dto.tipoMovimiento);
      if (!entrada) {
        await validarDisponibilidad(manager, [dto], dto.idBodega);
      }

      const costo =
        entrada && dto.costoUnitario !== undefined
          ? dto.costoUnitario
          : await costoPromedio(manager, dto.idProducto);

      const mov = manager.create(MovimientoInventario, {
        idProducto: dto.idProducto,
        idBodega: dto.idBodega,
        tipoMovimiento: dto.tipoMovimiento,
        cantidad: dto.cantidad,
        costoUnitario: costo,
        origenTabla: 'manual',
      });
      return manager.save(MovimientoInventario, mov);
    });
  }

  private async trasladar(manager: EntityManager, dto: RegistrarMovimientoDto) {
    if (dto.idBodegaDestino === dto.idBodega) {
      throw new BadRequestException('La bodega de destino debe ser distinta a la de origen');
    }
    await resolverBodega(manager, dto.idBodegaDestino);
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
      }),
    );
    return [salida, entrada];
  }

  async ajusteFisico(dto: AjusteFisicoDto): Promise<MovimientoInventario> {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);
      await this.obtenerProducto(manager, dto.idProducto);
      await resolverBodega(manager, dto.idBodega);

      const saldoActual = await saldoProducto(manager, dto.idProducto, dto.idBodega);
      const diferencia = redondear(dto.cantidadFisica - saldoActual, 3);

      if (diferencia === 0) {
        throw new BadRequestException('El saldo físico coincide con el sistema, no requiere ajuste.');
      }

      const mov = manager.create(MovimientoInventario, {
        idProducto: dto.idProducto,
        idBodega: dto.idBodega,
        tipoMovimiento: diferencia > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
        cantidad: Math.abs(diferencia),
        costoUnitario: await costoPromedio(manager, dto.idProducto),
        origenTabla: 'conteo_fisico',
      });
      return manager.save(MovimientoInventario, mov);
    });
  }

  async reversarMovimiento(id: string): Promise<MovimientoInventario> {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);
      const mov = await manager.findOne(MovimientoInventario, { where: { id } });
      if (!mov) throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);

      if (ORIGENES_DE_DOCUMENTO.includes(mov.origenTabla)) {
        throw new ConflictException(
          'Este movimiento lo generó un documento. Anule la factura correspondiente en lugar de reversarlo',
        );
      }
      if (mov.origenTabla === 'reversa_movimiento') {
        throw new ConflictException('No se puede reversar un movimiento de reversa');
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
          throw new ConflictException(
            `Stock insuficiente para reversar la entrada. Saldo actual: ${saldo}, cantidad: ${mov.cantidad}`,
          );
        }
      }

      const compensatorio = manager.create(MovimientoInventario, {
        idProducto: mov.idProducto,
        idBodega: mov.idBodega,
        tipoMovimiento: entrada ? 'AJUSTE_SALIDA' : 'AJUSTE_ENTRADA',
        cantidad: mov.cantidad,
        costoUnitario: mov.costoUnitario,
        origenTabla: 'reversa_movimiento',
        origenId: mov.id,
      });
      return manager.save(MovimientoInventario, compensatorio);
    });
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
      const costoUnitario = costos.get(item.idProducto);
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

  private async obtenerProducto(manager: EntityManager, id: string): Promise<Producto> {
    const producto = await manager.findOne(Producto, { where: { id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    if (!producto.manejaInventario) {
      throw new BadRequestException(`El producto ${producto.codigo} no maneja inventario`);
    }
    return producto;
  }
}
