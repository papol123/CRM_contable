import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import {
  FacturaCompra,
  DetalleFacturaCompra,
  EstadoFacturaCompra,
} from '../../database/entities/factura-compra.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Proveedor } from '../../database/entities/proveedor.entity';
import { Producto } from '../../database/entities/producto.entity';
import { ConsultaComprasDto, CreateFacturaCompraDto, UpdateFacturaCompraDto } from './dto/factura-compra.dto';
import { consultarSaldosCompra } from '../../common/documentos/saldos';
import { calcularTotalesCompra, redondear } from '../../common/documentos/totales';
import { leerFacturaUbl, normalizarNit } from '../../common/documentos/ubl-proveedor';
import { bloquearInventario, resolverBodega, saldoProducto } from '../../common/inventario/stock';
import { sumarDias } from '../../common/utils/fechas';
import { validarPeriodoAbierto } from '../../common/periodos/periodo-contable';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AdjuntosService, ArchivoSubido } from '../../common/archivos/adjuntos.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

const TIPOS_ADJUNTO_COMPRA = ['application/pdf', 'application/xml', 'text/xml'];

@Injectable()
export class ComprasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FacturaCompra)
    private readonly compraRepository: Repository<FacturaCompra>,
    private readonly adjuntos: AdjuntosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private totales(compra: FacturaCompra) {
    const t = calcularTotalesCompra(compra.detalles || [], {}, {
      retefuente: compra.retefuente,
      reteiva: compra.reteiva,
      reteica: compra.reteica,
    });
    return {
      subtotal: t.subtotal,
      totalDescuento: t.totalDescuento,
      base: t.base,
      totalIva: t.totalIva,
      retefuente: t.retefuente,
      reteiva: t.reteiva,
      reteica: t.reteica,
      totalRetenciones: t.totalRetenciones,
      total: t.total,
    };
  }

  async findAll(filtros: ConsultaComprasDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.compraRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('c.estado', 'e')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .orderBy('c.fechaEmision', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.search?.trim()) {
      query.andWhere('(LOWER(c.numeroFactura) LIKE :search OR LOWER(t.razonSocial) LIKE :search)', {
        search: `%${filtros.search.trim().toLowerCase()}%`,
      });
    }
    if (filtros.proveedorId) query.andWhere('c.idProveedor = :proveedorId', { proveedorId: filtros.proveedorId });
    if (filtros.desde) query.andWhere('c.fechaEmision >= :desde', { desde: filtros.desde.slice(0, 10) });
    if (filtros.hasta) query.andWhere('c.fechaEmision <= :hasta', { hasta: filtros.hasta.slice(0, 10) });

    const [compras, total] = await query.getManyAndCount();
    const saldos = new Map(
      (await consultarSaldosCompra(this.dataSource.manager, { ids: compras.map((c) => c.id) })).map((s) => [
        s.idFacturaCompra,
        s,
      ]),
    );

    const data = compras.map((c) => ({
      ...c,
      ...this.totales(c),
      pagado: saldos.get(c.id)?.pagado ?? 0,
      saldo: saldos.get(c.id)?.saldo ?? 0,
    }));
    return paginado(data, total, pagina);
  }

  async findById(id: string): Promise<any> {
    const compra = await this.compraRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('c.estado', 'e')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'prod')
      .where('c.id = :id', { id })
      .getOne();
    if (!compra) throw new NotFoundException(`Factura de compra con ID ${id} no encontrada`);

    const [saldo] = await consultarSaldosCompra(this.dataSource.manager, { id });
    return {
      ...compra,
      ...this.totales(compra),
      pagado: saldo?.pagado ?? 0,
      saldo: saldo?.saldo ?? 0,
    };
  }

  /**
   * Registro transaccional de la compra (catálogo §13): descuentos, IVA,
   * ReteFuente/ReteIVA/ReteICA, entrada de inventario al costo neto (que
   * actualiza el costo promedio ponderado) y cuenta por pagar (saldo).
   */
  async create(dto: CreateFacturaCompraDto, actor?: Actor): Promise<any> {
    const id = await this.dataSource.transaction(async (manager) => {
      const proveedor = await manager.findOne(Proveedor, { where: { id: dto.idProveedor } });
      if (!proveedor) throw new NotFoundException(`Proveedor con ID ${dto.idProveedor} no encontrado`);
      if (!proveedor.tercero?.activo) throw new UnprocessableEntityException('El proveedor está inactivo');

      await this.validarDuplicados(manager, dto.idProveedor, dto.numeroFactura, dto.cufe);

      const productos = await this.validarProductos(manager, dto.items.map((i) => i.idProducto));

      const estado = await manager.findOne(EstadoFacturaCompra, { where: { codigo: 'RECIBIDA' } });
      if (!estado) {
        throw new InternalServerErrorException('Falta el estado RECIBIDA en estados_factura_compra');
      }

      const fechaEmision = dto.fechaEmision.slice(0, 10);
      const fechaVencimiento =
        dto.fechaVencimiento?.slice(0, 10) || sumarDias(fechaEmision, Number(proveedor.diasPlazo || 0));
      if (fechaVencimiento < fechaEmision) {
        throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de emisión');
      }
      await validarPeriodoAbierto(manager, fechaEmision, 'registrar la compra');

      const totales = calcularTotalesCompra(dto.items, {
        pctRetefuente: dto.pctRetefuente,
        pctReteIva: dto.pctReteIva,
        tarifaReteIcaPorMil: dto.tarifaReteIcaPorMil,
      });
      if (totales.total < 0) {
        throw new UnprocessableEntityException('Las retenciones no pueden superar el valor de la compra');
      }

      await bloquearInventario(manager);
      const idBodega = await resolverBodega(manager, dto.idBodega);

      const compra = await manager.save(
        FacturaCompra,
        manager.create(FacturaCompra, {
          idProveedor: dto.idProveedor,
          idEstado: estado.id,
          numeroFactura: dto.numeroFactura?.trim() || undefined,
          cufe: dto.cufe?.trim() || undefined,
          fechaEmision,
          fechaVencimiento,
          idBodega,
          idUsuario: actor?.id,
          retefuente: totales.retefuente,
          reteiva: totales.reteiva,
          reteica: totales.reteica,
        }),
      );

      for (const item of dto.items) {
        // El costo que entra al kardex es neto de descuento (el IVA no es costo)
        const costoNeto = redondear(Number(item.costoUnitario) * (1 - Number(item.pctDescuento || 0) / 100));

        await manager.save(
          DetalleFacturaCompra,
          manager.create(DetalleFacturaCompra, {
            idFacturaCompra: compra.id,
            idProducto: item.idProducto,
            cantidad: item.cantidad,
            costoUnitario: item.costoUnitario,
            pctDescuento: item.pctDescuento || 0,
            pctIva: item.pctIva || 0,
          }),
        );

        if (productos.get(item.idProducto)!.manejaInventario) {
          await manager.save(
            MovimientoInventario,
            manager.create(MovimientoInventario, {
              idProducto: item.idProducto,
              idBodega,
              tipoMovimiento: 'ENTRADA',
              cantidad: item.cantidad,
              costoUnitario: costoNeto,
              origenTabla: 'facturas_compra',
              origenId: compra.id,
              idUsuario: actor?.id,
              motivo: `Compra ${dto.numeroFactura?.trim() || compra.id}`,
            }),
          );
        }

        // Último costo neto del proveedor para ese producto
        await manager.query(
          `INSERT INTO producto_proveedor (id_producto, id_proveedor, costo_actual, es_principal)
           VALUES ($1, $2, $3, NOT EXISTS (SELECT 1 FROM producto_proveedor WHERE id_producto = $1))
           ON CONFLICT (id_producto, id_proveedor) DO UPDATE SET costo_actual = EXCLUDED.costo_actual`,
          [item.idProducto, dto.idProveedor, costoNeto],
        );
      }

      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'CREAR',
          recurso: 'facturas_compra',
          idRecurso: compra.id,
          valorNuevo: { ...dto, totales },
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );
      return compra.id;
    });
    return this.findById(id);
  }

  async update(id: string, dto: UpdateFacturaCompraDto): Promise<any> {
    const compra = await this.compraRepository.findOne({ where: { id } });
    if (!compra) throw new NotFoundException('Factura de compra no encontrada');
    if (compra.estado?.codigo === 'ANULADA') {
      throw new ConflictException('No se puede modificar una factura de compra anulada');
    }

    const cambios: Partial<FacturaCompra> = {};
    if (dto.numeroFactura !== undefined && dto.numeroFactura.trim() !== compra.numeroFactura) {
      await this.validarDuplicados(this.dataSource.manager, compra.idProveedor, dto.numeroFactura, undefined, id);
      cambios.numeroFactura = dto.numeroFactura.trim();
    }
    if (dto.fechaVencimiento) {
      const fecha = dto.fechaVencimiento.slice(0, 10);
      if (fecha < String(compra.fechaEmision).slice(0, 10)) {
        throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la de emisión');
      }
      cambios.fechaVencimiento = fecha;
    }
    if (Object.keys(cambios).length > 0) await this.compraRepository.update(id, cambios);
    return this.findById(id);
  }

  /** Anula la compra, saca del inventario lo que entró y cierra la cuenta por pagar. */
  async anular(id: string, motivo: string, actor?: Actor) {
    return this.dataSource.transaction(async (manager) => {
      await bloquearInventario(manager);
      await manager.query(`SELECT 1 FROM facturas_compra WHERE id_factura_compra = $1 FOR UPDATE`, [id]);

      const compra = await manager.findOne(FacturaCompra, { where: { id } });
      if (!compra) throw new NotFoundException('Factura de compra no encontrada');
      if (compra.estado?.codigo === 'ANULADA') {
        throw new ConflictException('La factura de compra ya se encuentra anulada');
      }
      await validarPeriodoAbierto(manager, compra.fechaEmision, 'anular la compra');

      const [saldo] = await consultarSaldosCompra(manager, { id });
      if (saldo && saldo.pagado > 0) {
        throw new ConflictException(
          `La factura de compra tiene pagos aplicados por ${saldo.pagado}. Anule los pagos primero`,
        );
      }

      const entradas = await manager.find(MovimientoInventario, {
        where: { origenTabla: 'facturas_compra', origenId: id },
      });

      // La mercancía debe seguir en bodega para poder devolverla
      const porProductoBodega = new Map<string, { idProducto: string; idBodega: string; cantidad: number }>();
      for (const e of entradas) {
        const clave = `${e.idProducto}|${e.idBodega}`;
        const acumulado = porProductoBodega.get(clave) || { idProducto: e.idProducto, idBodega: e.idBodega, cantidad: 0 };
        acumulado.cantidad += Number(e.cantidad);
        porProductoBodega.set(clave, acumulado);
      }
      const faltantes: string[] = [];
      for (const { idProducto, idBodega, cantidad } of porProductoBodega.values()) {
        const disponible = await saldoProducto(manager, idProducto, idBodega);
        if (disponible < cantidad) {
          const producto = await manager.findOne(Producto, { where: { id: idProducto } });
          faltantes.push(`${producto?.codigo ?? idProducto} (en bodega ${disponible}, a devolver ${cantidad})`);
        }
      }
      if (faltantes.length > 0) {
        throw new ConflictException(
          `No se puede anular: parte de la mercancía ya salió del inventario: ${faltantes.join('; ')}`,
        );
      }

      for (const e of entradas) {
        await manager.save(
          MovimientoInventario,
          manager.create(MovimientoInventario, {
            idProducto: e.idProducto,
            idBodega: e.idBodega,
            tipoMovimiento: 'AJUSTE_SALIDA',
            cantidad: e.cantidad,
            costoUnitario: e.costoUnitario,
            origenTabla: 'anulacion_factura_compra',
            origenId: id,
            idUsuario: actor?.id,
            motivo: `Anulación compra ${compra.numeroFactura ?? id}: ${motivo}`,
          }),
        );
      }

      const estadoAnulada = await manager.findOne(EstadoFacturaCompra, { where: { codigo: 'ANULADA' } });
      if (!estadoAnulada) {
        throw new InternalServerErrorException('Falta el estado ANULADA en estados_factura_compra');
      }
      await manager.update(FacturaCompra, id, { idEstado: estadoAnulada.id, motivoAnulacion: motivo });

      await this.auditoria.registrar(
        {
          idUsuario: actor?.id,
          accion: 'ANULAR',
          recurso: 'facturas_compra',
          idRecurso: id,
          valorAnterior: { numero: compra.numeroFactura, estado: compra.estado?.codigo },
          valorNuevo: { estado: 'ANULADA', movimientosCompensatorios: entradas.length },
          motivo,
          ip: actor?.ip,
          userAgent: actor?.userAgent,
        },
        manager,
      );

      return {
        id,
        anulada: true,
        movimientosReversados: entradas.length,
        mensaje: `Factura de compra ${compra.numeroFactura ?? id} anulada: ${motivo}`,
      };
    });
  }

  private async validarDuplicados(
    manager: EntityManager,
    idProveedor: string,
    numeroFactura?: string,
    cufe?: string,
    excluirId?: string,
  ) {
    const excluir = excluirId ? { id: Not(excluirId) } : {};
    if (numeroFactura?.trim()) {
      const existe = await manager.count(FacturaCompra, {
        where: { idProveedor, numeroFactura: numeroFactura.trim(), ...excluir },
      });
      if (existe) {
        throw new ConflictException(
          `El proveedor ya tiene registrada la factura número ${numeroFactura.trim()}`,
        );
      }
    }
    if (cufe?.trim()) {
      const existe = await manager.count(FacturaCompra, { where: { cufe: cufe.trim(), ...excluir } });
      if (existe) throw new ConflictException(`Ya existe una factura de compra con el CUFE ${cufe.trim()}`);
    }
  }

  private async validarProductos(manager: EntityManager, ids: string[]) {
    const unicos = [...new Set(ids)];
    const productos = await manager.find(Producto, { where: { id: In(unicos) } });
    if (productos.length !== unicos.length) {
      const encontrados = new Set(productos.map((p) => p.id));
      throw new NotFoundException(
        `Productos no encontrados: ${unicos.filter((i) => !encontrados.has(i)).join(', ')}`,
      );
    }
    return new Map(productos.map((p) => [p.id, p]));
  }

  // ─── Adjuntos ──────────────────────────────────────────────────────────────

  async adjuntarArchivo(id: string, archivo: ArchivoSubido) {
    const existe = await this.compraRepository.count({ where: { id } });
    if (!existe) throw new NotFoundException(`Factura de compra con ID ${id} no encontrada`);
    return this.adjuntos.guardar('facturas_compra', id, archivo, TIPOS_ADJUNTO_COMPRA);
  }

  async getAdjuntos(id: string) {
    const existe = await this.compraRepository.count({ where: { id } });
    if (!existe) throw new NotFoundException(`Factura de compra con ID ${id} no encontrada`);
    return this.adjuntos.listar('facturas_compra', id, `/api/v1/facturas-compra/${id}/adjuntos`);
  }

  async descargarAdjunto(id: string, idAdjunto: string) {
    return this.adjuntos.leer('facturas_compra', id, idAdjunto);
  }

  // ─── Importación de XML del proveedor ──────────────────────────────────────

  /**
   * Lee la factura electrónica UBL del proveedor y devuelve una precarga lista
   * para POST /facturas-compra. No guarda nada: el usuario revisa y confirma.
   */
  async importarXml(xml: string | Buffer, idProveedor?: string) {
    const ubl = leerFacturaUbl(xml);
    const advertencias: string[] = [];

    let proveedor: { id_proveedor: string; razon_social: string; numero_documento: string } | undefined;
    if (idProveedor) {
      [proveedor] = await this.dataSource.query(
        `SELECT p.id_proveedor, t.razon_social, t.numero_documento
           FROM proveedores p JOIN terceros t ON t.id_tercero = p.id_tercero WHERE p.id_proveedor = $1`,
        [idProveedor],
      );
      if (!proveedor) throw new NotFoundException(`Proveedor ${idProveedor} no encontrado`);
      if (ubl.proveedor.nit && normalizarNit(proveedor.numero_documento) !== normalizarNit(ubl.proveedor.nit)) {
        advertencias.push(
          `El NIT del XML (${ubl.proveedor.nit}) no coincide con el del proveedor seleccionado (${proveedor.numero_documento})`,
        );
      }
    } else if (ubl.proveedor.nit) {
      [proveedor] = await this.dataSource.query(
        `SELECT p.id_proveedor, t.razon_social, t.numero_documento
           FROM proveedores p JOIN terceros t ON t.id_tercero = p.id_tercero
          WHERE split_part(regexp_replace(t.numero_documento, '[.\\s]', '', 'g'), '-', 1) = $1`,
        [normalizarNit(ubl.proveedor.nit)],
      );
      if (!proveedor) {
        advertencias.push(
          `No hay un proveedor registrado con NIT ${ubl.proveedor.nit} (${ubl.proveedor.razonSocial ?? 'sin nombre'}). Créelo antes de registrar la compra`,
        );
      }
    }

    // Se asocian las líneas a productos por el código del proveedor
    const codigos = ubl.lineas.map((l) => l.codigo).filter((c): c is string => !!c);
    const productos: Array<{ id_producto: string; codigo: string; nombre: string }> = codigos.length
      ? await this.dataSource.query(
          `SELECT id_producto, codigo, nombre FROM productos WHERE codigo = ANY($1)`,
          [codigos],
        )
      : [];
    const porCodigo = new Map(productos.map((p) => [p.codigo, p]));

    const items = ubl.lineas.map((l, i) => {
      const producto = l.codigo ? porCodigo.get(l.codigo) : undefined;
      if (!producto) {
        advertencias.push(`Línea ${i + 1} (${l.codigo ?? 'sin código'} — ${l.descripcion}): no se encontró el producto; asígnelo manualmente`);
      }
      return {
        idProducto: producto?.id_producto ?? null,
        productoEncontrado: producto ? { codigo: producto.codigo, nombre: producto.nombre } : null,
        codigoProveedor: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
        pctDescuento: l.pctDescuento,
        pctIva: l.pctIva,
      };
    });

    let duplicada = false;
    if (ubl.cufe) {
      const [fila] = await this.dataSource.query(`SELECT 1 FROM facturas_compra WHERE cufe = $1`, [ubl.cufe]);
      duplicada = !!fila;
      if (duplicada) advertencias.push(`La factura con CUFE ${ubl.cufe} ya fue registrada`);
    }

    return {
      precarga: {
        idProveedor: proveedor?.id_proveedor ?? null,
        numeroFactura: ubl.numero,
        cufe: ubl.cufe,
        fechaEmision: ubl.fechaEmision,
        fechaVencimiento: ubl.fechaVencimiento,
        items,
      },
      proveedorXml: ubl.proveedor,
      totalesXml: ubl.totales,
      duplicada,
      advertencias,
    };
  }
}
