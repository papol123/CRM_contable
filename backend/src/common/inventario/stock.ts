import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * Reglas de inventario compartidas por ventas, compras, pedidos e inventario.
 * El saldo no se guarda: es la suma con signo de los movimientos (kardex).
 */

export const TIPOS_ENTRADA = ['ENTRADA', 'AJUSTE_ENTRADA', 'TRASLADO_ENTRADA'] as const;
export const TIPOS_SALIDA = ['SALIDA', 'AJUSTE_SALIDA', 'TRASLADO_SALIDA'] as const;
export const TIPOS_MOVIMIENTO = [...TIPOS_ENTRADA, ...TIPOS_SALIDA] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Estados de pedido que mantienen stock reservado. */
export const ESTADOS_PEDIDO_CON_RESERVA = ['RECIBIDO', 'EN_PROCESO', 'ENVIADO', 'ENTREGADO'];

const LISTA_ENTRADAS = TIPOS_ENTRADA.map((t) => `'${t}'`).join(', ');

export const sqlCantidadConSigno = (alias = 'm') =>
  `CASE WHEN ${alias}.tipo_movimiento IN (${LISTA_ENTRADAS}) THEN ${alias}.cantidad ELSE -${alias}.cantidad END`;

export function esEntrada(tipo: string): boolean {
  return (TIPOS_ENTRADA as readonly string[]).includes(tipo);
}

/**
 * Serializa las transacciones que mueven inventario para que dos ventas
 * simultáneas no validen el mismo stock. Se libera al terminar la transacción.
 */
export async function bloquearInventario(db: EntityManager): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('crm_inventario'))`);
}

export async function saldoProducto(
  db: EntityManager,
  idProducto: string,
  idBodega?: string,
): Promise<number> {
  const params: any[] = [idProducto];
  let filtroBodega = '';
  if (idBodega) {
    params.push(idBodega);
    filtroBodega = 'AND m.id_bodega = $2';
  }
  const [fila] = await db.query(
    `SELECT COALESCE(SUM(${sqlCantidadConSigno('m')}), 0) AS saldo
       FROM movimientos_inventario m
      WHERE m.id_producto = $1 ${filtroBodega}`,
    params,
  );
  return Number(fila?.saldo || 0);
}

export async function reservadoProducto(
  db: EntityManager,
  idProducto: string,
  idBodega: string,
  excluirPedidoId?: string,
): Promise<number> {
  const params: any[] = [idProducto, idBodega, ESTADOS_PEDIDO_CON_RESERVA];
  let exclusion = '';
  if (excluirPedidoId) {
    params.push(excluirPedidoId);
    exclusion = 'AND p.id_pedido <> $4';
  }
  const [fila] = await db.query(
    `SELECT COALESCE(SUM(d.cantidad), 0) AS reservado
       FROM detalle_pedido d
       JOIN pedidos p ON p.id_pedido = d.id_pedido
      WHERE d.id_producto = $1 AND p.id_bodega = $2 AND p.estado = ANY($3) ${exclusion}`,
    params,
  );
  return Number(fila?.reservado || 0);
}

/**
 * Costo promedio ponderado de las entradas con costo (compras y entradas
 * manuales), sin contar compras anuladas. Si el producto nunca ha entrado,
 * usa el costo del proveedor principal.
 */
export async function costoPromedio(db: EntityManager, idProducto: string): Promise<number> {
  const [fila] = await db.query(
    `SELECT CASE WHEN SUM(m.cantidad) > 0
                 THEN ROUND(SUM(m.cantidad * m.costo_unitario) / SUM(m.cantidad), 2)
            END AS costo
       FROM movimientos_inventario m
      WHERE m.id_producto = $1
        AND m.tipo_movimiento = 'ENTRADA'
        AND m.costo_unitario > 0
        AND NOT EXISTS (
          SELECT 1 FROM facturas_compra fc
            JOIN estados_factura_compra e ON e.id_estado = fc.id_estado
           WHERE m.origen_tabla = 'facturas_compra'
             AND fc.id_factura_compra = m.origen_id
             AND e.codigo = 'ANULADA')`,
    [idProducto],
  );
  if (fila?.costo != null) return Number(fila.costo);

  const [proveedor] = await db.query(
    `SELECT costo_actual FROM producto_proveedor
      WHERE id_producto = $1
      ORDER BY es_principal DESC, costo_actual ASC
      LIMIT 1`,
    [idProducto],
  );
  return Number(proveedor?.costo_actual || 0);
}

/** Primera bodega activa por código. Reemplaza `findOne(Bodega, { where: {} })`. */
export async function resolverBodega(db: EntityManager, idBodega?: string): Promise<string> {
  if (idBodega) {
    const [bodega] = await db.query(
      `SELECT id_bodega, activo FROM bodegas WHERE id_bodega = $1`,
      [idBodega],
    );
    if (!bodega) throw new NotFoundException(`Bodega con ID ${idBodega} no encontrada`);
    if (!bodega.activo) throw new BadRequestException('La bodega seleccionada está inactiva');
    return bodega.id_bodega;
  }
  const [porDefecto] = await db.query(
    `SELECT id_bodega FROM bodegas WHERE activo = true ORDER BY codigo LIMIT 1`,
  );
  if (!porDefecto) throw new BadRequestException('No hay bodegas activas configuradas');
  return porDefecto.id_bodega;
}

export interface ItemStock {
  idProducto: string;
  cantidad: number | string;
}

/**
 * Verifica que haya stock disponible (saldo − reservas de pedidos) para
 * todos los items en la bodega. Lanza 409 con el detalle de faltantes.
 * Los productos que no manejan inventario no se validan.
 * Devuelve el conjunto de productos que sí manejan inventario.
 */
export async function validarDisponibilidad(
  db: EntityManager,
  items: ItemStock[],
  idBodega: string,
  opciones: { excluirPedidoId?: string; descontarReservas?: boolean } = {},
): Promise<Set<string>> {
  const descontarReservas = opciones.descontarReservas ?? true;
  const cantidades = new Map<string, number>();
  for (const item of items) {
    cantidades.set(item.idProducto, (cantidades.get(item.idProducto) || 0) + Number(item.cantidad));
  }

  const ids = [...cantidades.keys()];
  const productos: Array<{ id_producto: string; codigo: string; nombre: string; maneja_inventario: boolean; activo: boolean }> =
    await db.query(
      `SELECT id_producto, codigo, nombre, maneja_inventario, activo
         FROM productos WHERE id_producto = ANY($1)`,
      [ids],
    );

  const encontrados = new Map(productos.map((p) => [p.id_producto, p]));
  const inexistentes = ids.filter((id) => !encontrados.has(id));
  if (inexistentes.length > 0) {
    throw new NotFoundException(`Productos no encontrados: ${inexistentes.join(', ')}`);
  }
  const inactivos = productos.filter((p) => !p.activo);
  if (inactivos.length > 0) {
    throw new BadRequestException(
      `Productos inactivos: ${inactivos.map((p) => p.codigo).join(', ')}`,
    );
  }

  const conInventario = new Set<string>();
  const faltantes: string[] = [];

  for (const [idProducto, cantidad] of cantidades) {
    const producto = encontrados.get(idProducto);
    if (!producto.maneja_inventario) continue;
    conInventario.add(idProducto);

    const saldo = await saldoProducto(db, idProducto, idBodega);
    const reservado = descontarReservas
      ? await reservadoProducto(db, idProducto, idBodega, opciones.excluirPedidoId)
      : 0;
    const disponible = saldo - reservado;
    if (disponible < cantidad) {
      faltantes.push(
        `${producto.codigo} (disponible ${disponible}${reservado ? `, reservado ${reservado}` : ''}, solicitado ${cantidad})`,
      );
    }
  }

  if (faltantes.length > 0) {
    throw new ConflictException(`Stock insuficiente en la bodega: ${faltantes.join('; ')}`);
  }

  return conInventario;
}
