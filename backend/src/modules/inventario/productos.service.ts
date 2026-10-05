import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Producto } from '../../database/entities/producto.entity';
import { PrecioProducto, ListaPrecios } from '../../database/entities/precio-proveedor.entity';
import {
  CreateProductoDto,
  UpdateProductoDto,
  UpdatePrecioDto,
  UpdateStockMinimoDto,
  PreciosMasivosDto,
  ConsultaProductosDto,
} from './dto/producto.dto';
import { ESTADOS_PEDIDO_CON_RESERVA, costoPromedio, sqlCantidadConSigno } from '../../common/inventario/stock';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { redondear } from '../../common/documentos/totales';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

const LISTA_PUBLICA = 'Precio Público / Mostrador';
const PERMISO_PRECIOS = 'productos.precios';
const PERMISO_ELIMINAR = 'productos.eliminar';

@Injectable()
export class ProductosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(PrecioProducto)
    private readonly precioRepository: Repository<PrecioProducto>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros: ConsultaProductosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.productoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .leftJoinAndSelect('p.unidad', 'uni')
      .leftJoinAndSelect('p.impuesto', 'imp')
      .leftJoinAndSelect('p.precios', 'pr')
      .leftJoinAndSelect('pr.lista', 'pl')
      .orderBy('p.nombre', 'ASC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.search?.trim()) {
      query.andWhere('(LOWER(p.nombre) LIKE :search OR LOWER(p.codigo) LIKE :search)', {
        search: `%${filtros.search.trim().toLowerCase()}%`,
      });
    }
    if (filtros.categoriaId) query.andWhere('p.idCategoria = :categoriaId', { categoriaId: filtros.categoriaId });
    if (filtros.marcaId) query.andWhere('p.idMarca = :marcaId', { marcaId: filtros.marcaId });

    const [productos, total] = await query.getManyAndCount();

    // Saldo total de la página en una sola consulta
    const saldos = new Map<string, number>();
    if (productos.length) {
      const filas = await this.dataSource.query(
        `SELECT m.id_producto, COALESCE(SUM(${sqlCantidadConSigno('m')}), 0) AS saldo
           FROM movimientos_inventario m
          WHERE m.id_producto = ANY($1::uuid[])
          GROUP BY m.id_producto`,
        [productos.map((p) => p.id)],
      );
      for (const f of filas) saldos.set(f.id_producto, Number(f.saldo));
    }

    return paginado(
      productos.map((p) => ({ ...p, saldoActual: saldos.get(p.id) ?? 0 })),
      total,
      pagina,
    );
  }

  async buscar(q: string): Promise<Producto[]> {
    return this.productoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .leftJoinAndSelect('p.precios', 'pr')
      .leftJoinAndSelect('pr.lista', 'pl')
      .where('(LOWER(p.nombre) LIKE :q OR LOWER(p.codigo) LIKE :q)', {
        q: `%${q.trim().toLowerCase()}%`,
      })
      .andWhere('p.activo = true')
      .orderBy('p.nombre', 'ASC')
      .take(15)
      .getMany();
  }

  /** Detalle con precio, impuesto y saldos por bodega. */
  async findById(id: string): Promise<any> {
    const producto = await this.productoRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categoria', 'cat')
      .leftJoinAndSelect('p.unidad', 'uni')
      .leftJoinAndSelect('p.impuesto', 'imp')
      .leftJoinAndSelect('p.precios', 'pr')
      .leftJoinAndSelect('pr.lista', 'pl')
      .where('p.id = :id', { id })
      .getOne();

    if (!producto) throw new NotFoundException(`Producto con ID ${id} no encontrado`);

    const saldosPorBodega = await this.dataSource.query(
      `SELECT b.id_bodega AS "idBodega", b.nombre AS "bodegaNombre", b.codigo AS "bodegaCodigo",
              COALESCE(SUM(${sqlCantidadConSigno('m')}), 0) AS saldo
         FROM movimientos_inventario m
         JOIN bodegas b ON b.id_bodega = m.id_bodega
        WHERE m.id_producto = $1
        GROUP BY b.id_bodega, b.nombre, b.codigo
        ORDER BY b.codigo`,
      [id],
    );

    const bodegas = saldosPorBodega.map((b: any) => ({ ...b, saldo: Number(b.saldo || 0) }));
    return {
      ...producto,
      saldoTotal: redondear(bodegas.reduce((acc: number, b: any) => acc + b.saldo, 0), 3),
      saldosPorBodega: bodegas,
    };
  }

  async create(dto: CreateProductoDto, actor: Actor): Promise<Producto> {
    if (dto.precioBase !== undefined && !actor.permisos.includes(PERMISO_PRECIOS)) {
      throw new ForbiddenException('Asignar el precio de venta requiere el permiso productos.precios');
    }
    const codigo = dto.codigo.trim();
    const existing = await this.productoRepository.findOne({ where: { codigo } });
    if (existing) throw new ConflictException(`Ya existe un producto con el código ${codigo}`);

    const id = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        Producto,
        manager.create(Producto, {
          codigo,
          nombre: dto.nombre.trim(),
          idCategoria: dto.idCategoria,
          idUnidad: dto.idUnidad,
          idImpuestoVenta: dto.idImpuestoVenta,
          manejaInventario: dto.manejaInventario ?? true,
          stockMinimo: dto.stockMinimo ?? 0,
          idMarca: dto.idMarca,
          activo: true,
        }),
      );

      if (dto.precioBase) {
        const listaPub = await manager.findOne(ListaPrecios, { where: { nombre: LISTA_PUBLICA } });
        if (!listaPub) throw new BadRequestException(`No existe la lista de precios "${LISTA_PUBLICA}"`);
        await this.registrarPrecio(manager, saved.id, listaPub.id, dto.precioBase, fechaHoy());
      }
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CREAR',
          recurso: 'productos',
          idRecurso: saved.id,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return saved.id;
    });

    return this.findById(id);
  }

  async update(id: string, dto: UpdateProductoDto, actor: Actor): Promise<Producto> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);

    if (dto.activo !== undefined && dto.activo !== prod.activo) {
      if (!actor.permisos.includes(PERMISO_ELIMINAR)) {
        throw new ForbiddenException('Activar o desactivar productos requiere el permiso productos.eliminar');
      }
      if (!dto.activo) await this.validarPuedeDesactivar(this.dataSource.manager, prod);
    }

    const anterior = {
      nombre: prod.nombre,
      idCategoria: prod.idCategoria,
      idUnidad: prod.idUnidad,
      idImpuestoVenta: prod.idImpuestoVenta,
      idMarca: prod.idMarca,
      activo: prod.activo,
    };
    if (dto.nombre !== undefined) prod.nombre = dto.nombre.trim();
    if (dto.idCategoria !== undefined) prod.idCategoria = dto.idCategoria;
    if (dto.idUnidad !== undefined) prod.idUnidad = dto.idUnidad;
    if (dto.idImpuestoVenta !== undefined) prod.idImpuestoVenta = dto.idImpuestoVenta;
    if (dto.idMarca !== undefined) prod.idMarca = dto.idMarca;
    if (dto.activo !== undefined) prod.activo = dto.activo;
    await this.productoRepository.save(prod);

    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'ACTUALIZAR',
      recurso: 'productos',
      idRecurso: id,
      valorAnterior: anterior,
      valorNuevo: dto,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return this.findById(id);
  }

  /** Borrado lógico: el historial (kardex, ventas, compras) se conserva. */
  async remove(id: string, actor: Actor): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const prod = await manager.findOne(Producto, { where: { id } });
      if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      if (!prod.activo) throw new ConflictException('El producto ya está inactivo');
      await this.validarPuedeDesactivar(manager, prod);

      await manager.update(Producto, id, { activo: false });
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ELIMINAR',
          recurso: 'productos',
          idRecurso: id,
          valorAnterior: { codigo: prod.codigo, activo: true },
          valorNuevo: { activo: false },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { message: `Producto ${prod.codigo} desactivado (borrado lógico)` };
    });
  }

  /** No se desactiva un producto con existencias o con stock reservado por pedidos abiertos. */
  private async validarPuedeDesactivar(db: EntityManager, prod: Producto) {
    const [fila] = await db.query(
      `SELECT
         (SELECT COALESCE(SUM(${sqlCantidadConSigno('m')}), 0) FROM movimientos_inventario m WHERE m.id_producto = $1) AS saldo,
         (SELECT COUNT(*) FROM detalle_pedido d JOIN pedidos pe ON pe.id_pedido = d.id_pedido
           WHERE d.id_producto = $1 AND pe.estado = ANY($2))::int AS pedidos_abiertos`,
      [prod.id, ESTADOS_PEDIDO_CON_RESERVA],
    );
    if (Number(fila.saldo) > 0) {
      throw new ConflictException(
        `El producto ${prod.codigo} tiene ${Number(fila.saldo)} unidades en inventario. Sáquelas o ajústelas antes de desactivarlo`,
      );
    }
    if (fila.pedidos_abiertos > 0) {
      throw new ConflictException(`El producto ${prod.codigo} está en ${fila.pedidos_abiertos} pedido(s) abiertos`);
    }
  }

  async updatePrecio(id: string, dto: UpdatePrecioDto, actor: Actor): Promise<PrecioProducto> {
    return this.dataSource.transaction(async (manager) => {
      const prod = await manager.findOne(Producto, { where: { id } });
      if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      const { anterior, nuevo } = await this.registrarPrecio(
        manager,
        id,
        dto.idLista,
        dto.precio,
        dto.vigenteDesde?.slice(0, 10) || fechaHoy(),
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CAMBIAR_PRECIO',
          recurso: 'productos',
          idRecurso: id,
          valorAnterior: { idLista: dto.idLista, precio: anterior },
          valorNuevo: { idLista: dto.idLista, precio: dto.precio, vigenteDesde: nuevo.vigenteDesde },
          motivo: dto.motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return nuevo;
    });
  }

  /** Registra un precio nuevo y cierra la vigencia del precio abierto de la misma lista. */
  private async registrarPrecio(
    manager: EntityManager,
    idProducto: string,
    idLista: string,
    precio: number,
    vigenteDesde: string,
  ): Promise<{ anterior: number | null; nuevo: PrecioProducto }> {
    const lista = await manager.findOne(ListaPrecios, { where: { id: idLista } });
    if (!lista) throw new BadRequestException(`La lista de precios ${idLista} no existe`);

    const abierto = await manager.findOne(PrecioProducto, { where: { idProducto, idLista, vigenteHasta: IsNull() } });
    if (abierto && String(abierto.vigenteDesde).slice(0, 10) > vigenteDesde) {
      throw new ConflictException('La vigencia del nuevo precio no puede ser anterior a la del precio vigente');
    }
    await manager.update(
      PrecioProducto,
      { idProducto, idLista, vigenteHasta: IsNull() },
      { vigenteHasta: sumarDias(vigenteDesde, -1) },
    );

    const nuevo = await manager.save(
      PrecioProducto,
      manager.create(PrecioProducto, { idProducto, idLista, precio, vigenteDesde }),
    );
    return { anterior: abierto ? Number(abierto.precio) : null, nuevo };
  }

  async updateStockMinimo(id: string, dto: UpdateStockMinimoDto): Promise<Producto> {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    prod.stockMinimo = dto.stockMinimo;
    return this.productoRepository.save(prod);
  }

  async historialPrecios(id: string) {
    const prod = await this.productoRepository.findOne({ where: { id } });
    if (!prod) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    const precios = await this.precioRepository.find({
      where: { idProducto: id },
      relations: ['lista'],
      order: { vigenteDesde: 'DESC' },
    });
    // Historial de costo: cada compra registra el costo unitario pagado al proveedor
    const costos = await this.dataSource.query(
      `SELECT fc.fecha_emision AS fecha, t.razon_social AS proveedor, fc.numero_factura AS "numeroFactura",
              d.costo_unitario AS "costoUnitario", d.pct_descuento AS "pctDescuento",
              ROUND(d.costo_unitario * (1 - COALESCE(d.pct_descuento, 0) / 100), 2) AS "costoNeto"
         FROM detalle_factura_compra d
         JOIN facturas_compra fc ON fc.id_factura_compra = d.id_factura_compra
         JOIN estados_factura_compra e ON e.id_estado = fc.id_estado AND e.codigo <> 'ANULADA'
         JOIN proveedores pr ON pr.id_proveedor = fc.id_proveedor
         JOIN terceros t ON t.id_tercero = pr.id_tercero
        WHERE d.id_producto = $1
        ORDER BY fc.fecha_emision DESC
        LIMIT 200`,
      [id],
    );
    return {
      producto: { id: prod.id, codigo: prod.codigo, nombre: prod.nombre },
      costoPromedioActual: await costoPromedio(this.dataSource.manager, id),
      precios,
      costos: costos.map((c: any) => ({
        ...c,
        costoUnitario: Number(c.costoUnitario),
        pctDescuento: Number(c.pctDescuento),
        costoNeto: Number(c.costoNeto),
      })),
    };
  }

  async getMargen(id: string) {
    const prod = await this.findById(id);
    const costoAdquisicion = await costoPromedio(this.dataSource.manager, id);

    const hoy = fechaHoy();
    const precioVigente = (prod.precios || [])
      .filter(
        (p: PrecioProducto) =>
          p.lista?.nombre === LISTA_PUBLICA &&
          String(p.vigenteDesde).slice(0, 10) <= hoy &&
          (!p.vigenteHasta || String(p.vigenteHasta).slice(0, 10) >= hoy),
      )
      .sort((a: PrecioProducto, b: PrecioProducto) => String(b.vigenteDesde).localeCompare(String(a.vigenteDesde)))[0];

    if (!precioVigente) {
      throw new NotFoundException(`El producto ${prod.codigo} no tiene precio público vigente`);
    }

    const precioPublico = Number(precioVigente.precio);
    const margenBruto = redondear(precioPublico - costoAdquisicion);

    return {
      productoId: id,
      codigo: prod.codigo,
      nombre: prod.nombre,
      costoAdquisicion,
      metodoCosto: 'Costo promedio ponderado',
      precioPublico,
      margenBruto,
      porcentajeMargen: `${((margenBruto / precioPublico) * 100).toFixed(2)}%`,
    };
  }

  /** Todo o nada: si un código no existe no se cambia ningún precio. */
  async actualizarPreciosMasivo(dto: PreciosMasivosDto, actor: Actor) {
    const fecha = fechaHoy();
    return this.dataSource.transaction(async (manager) => {
      const codigos = [...new Set(dto.cambios.map((c) => c.codigoProducto.trim()))];
      const productos: Array<{ id_producto: string; codigo: string }> = await manager.query(
        `SELECT id_producto, codigo FROM productos WHERE codigo = ANY($1)`,
        [codigos],
      );
      const porCodigo = new Map(productos.map((p) => [p.codigo, p.id_producto]));
      const noEncontrados = codigos.filter((c) => !porCodigo.has(c));
      if (noEncontrados.length) {
        throw new BadRequestException(`Códigos de producto inexistentes: ${noEncontrados.join(', ')}`);
      }

      const cambios = [];
      for (const cambio of dto.cambios) {
        const idProducto = porCodigo.get(cambio.codigoProducto.trim())!;
        const { anterior } = await this.registrarPrecio(manager, idProducto, cambio.idLista, cambio.nuevoPrecio, fecha);
        cambios.push({ codigo: cambio.codigoProducto, idLista: cambio.idLista, anterior, nuevo: cambio.nuevoPrecio });
      }

      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CAMBIAR_PRECIO_MASIVO',
          recurso: 'productos',
          valorNuevo: { cambios },
          motivo: dto.motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { actualizados: cambios.length, cambios };
    });
  }

  async getEquivalencias(productoId: string): Promise<any[]> {
    const existe = await this.productoRepository.count({ where: { id: productoId } });
    if (!existe) throw new NotFoundException(`Producto con ID ${productoId} no encontrado`);
    return this.dataSource.query(
      `SELECT eq.id_equivalencia AS id, p.id_producto AS "productoId", p.codigo, p.nombre, p.activo,
              eq.observacion, eq.creado_en AS "creadoEn"
       FROM producto_equivalencias eq
       JOIN productos p ON p.id_producto = eq.id_producto_equivalente
       WHERE eq.id_producto_origen = $1
       ORDER BY p.codigo`,
      [productoId],
    );
  }

  /** La equivalencia se registra en ambos sentidos. */
  async createEquivalencia(productoId: string, idEquivalente: string, observacion?: string) {
    if (productoId === idEquivalente) {
      throw new BadRequestException('Un producto no puede ser equivalente de sí mismo');
    }
    const encontrados = await this.productoRepository.count({ where: [{ id: productoId }, { id: idEquivalente }] });
    if (encontrados < 2) throw new NotFoundException('Uno de los productos no existe');

    await this.dataSource.transaction(async (manager) => {
      for (const [origen, destino] of [
        [productoId, idEquivalente],
        [idEquivalente, productoId],
      ]) {
        await manager.query(
          `INSERT INTO producto_equivalencias (id_producto_origen, id_producto_equivalente, observacion)
           VALUES ($1, $2, $3)
           ON CONFLICT (id_producto_origen, id_producto_equivalente) DO UPDATE SET observacion = EXCLUDED.observacion`,
          [origen, destino, observacion || null],
        );
      }
    });
    return this.getEquivalencias(productoId);
  }

  async importar(items: CreateProductoDto[], actor: Actor) {
    let importados = 0;
    const errores: Array<{ indice: number; codigo: string; error: string }> = [];

    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i], actor);
        importados++;
      } catch (err: any) {
        errores.push({ indice: i, codigo: items[i].codigo, error: err.message });
      }
    }

    return { total: items.length, importados, fallidos: errores.length, errores };
  }
}
