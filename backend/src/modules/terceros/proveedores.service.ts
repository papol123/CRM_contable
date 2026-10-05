import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Proveedor } from '../../database/entities/proveedor.entity';
import { Tercero } from '../../database/entities/tercero.entity';
import { Telefono, Email } from '../../database/entities/contacto-datos.entity';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor-datos.dto';
import { consultarSaldosCompra, SQL_PAGADO_FACTURA_COMPRA, SQL_TOTAL_FACTURA_COMPRA } from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';
import { ConsultaTercerosDto, HistorialComprasDto } from './dto/cliente.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Proveedor)
    private readonly proveedorRepository: Repository<Proveedor>,
    @InjectRepository(Tercero)
    private readonly terceroRepository: Repository<Tercero>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros: ConsultaTercerosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.proveedorRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('t.tipoDocumento', 'td')
      .leftJoinAndSelect('t.ciudad', 'cd')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.emails', 'em')
      .orderBy('t.razonSocial', 'ASC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.search?.trim()) {
      query.andWhere('(LOWER(t.razonSocial) LIKE :search OR LOWER(t.numeroDocumento) LIKE :search)', {
        search: `%${filtros.search.trim().toLowerCase()}%`,
      });
    }
    if (filtros.ciudadId) query.andWhere('t.idCiudad = :ciudadId', { ciudadId: filtros.ciudadId });

    const [data, total] = await query.getManyAndCount();
    return paginado(data, total, pagina);
  }

  async findById(id: string): Promise<Proveedor> {
    const proveedor = await this.proveedorRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('t.tipoDocumento', 'td')
      .leftJoinAndSelect('t.ciudad', 'cd')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.emails', 'em')
      .leftJoinAndSelect('t.direcciones', 'dir')
      .leftJoinAndSelect('t.contactos', 'con')
      .where('p.id = :id', { id })
      .getOne();

    if (!proveedor) throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    return proveedor;
  }

  async create(dto: CreateProveedorDto, actor: Actor): Promise<Proveedor> {
    const existing = await this.terceroRepository.findOne({
      where: { numeroDocumento: dto.numeroDocumento.trim() },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un tercero registrado con el documento ${dto.numeroDocumento}`,
      );
    }

    const idProveedor = await this.dataSource.transaction(async (manager) => {
      const tercero = await manager.save(
        Tercero,
        manager.create(Tercero, {
          idTipoDocumento: dto.idTipoDocumento,
          numeroDocumento: dto.numeroDocumento.trim(),
          razonSocial: dto.razonSocial.trim(),
          tipoPersona: dto.tipoPersona,
          idCiudad: dto.idCiudad,
          activo: true,
        }),
      );

      if (dto.telefono) {
        await manager.save(Telefono, {
          idTercero: tercero.id,
          numero: dto.telefono,
          tipo: 'FIJO',
          principal: true,
        });
      }
      if (dto.email) {
        await manager.save(Email, {
          idTercero: tercero.id,
          email: dto.email.toLowerCase(),
          tipo: 'VENTAS',
          principal: true,
        });
      }

      const proveedor = await manager.save(
        Proveedor,
        manager.create(Proveedor, { idTercero: tercero.id, diasPlazo: dto.diasPlazo || 0 }),
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CREAR',
          recurso: 'proveedores',
          idRecurso: proveedor.id,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return proveedor.id;
    });

    return this.findById(idProveedor);
  }

  async update(id: string, dto: UpdateProveedorDto, actor: Actor): Promise<Proveedor> {
    const proveedor = await this.findById(id);
    if (dto.activo !== undefined && dto.activo !== proveedor.tercero.activo) {
      if (!actor.permisos.includes('terceros.eliminar')) {
        throw new ForbiddenException('Activar o desactivar proveedores requiere el permiso terceros.eliminar');
      }
      if (!dto.activo) await this.validarPuedeDesactivar(proveedor);
    }

    if (dto.razonSocial || dto.idCiudad !== undefined || dto.activo !== undefined) {
      await this.terceroRepository.update(proveedor.tercero.id, {
        ...(dto.razonSocial ? { razonSocial: dto.razonSocial.trim() } : {}),
        ...(dto.idCiudad !== undefined ? { idCiudad: dto.idCiudad } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      });
    }
    if (dto.diasPlazo !== undefined) {
      await this.proveedorRepository.update(id, { diasPlazo: dto.diasPlazo });
    }

    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'ACTUALIZAR',
      recurso: 'proveedores',
      idRecurso: id,
      valorAnterior: {
        razonSocial: proveedor.tercero.razonSocial,
        idCiudad: proveedor.tercero.idCiudad,
        diasPlazo: proveedor.diasPlazo,
        activo: proveedor.tercero.activo,
      },
      valorNuevo: dto,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return this.findById(id);
  }

  /** Borrado lógico: se impide si quedan cuentas por pagar al proveedor. */
  async remove(id: string, actor: Actor): Promise<{ message: string }> {
    const proveedor = await this.findById(id);
    if (!proveedor.tercero.activo) throw new ConflictException('El proveedor ya está inactivo');
    await this.validarPuedeDesactivar(proveedor);
    await this.terceroRepository.update(proveedor.tercero.id, { activo: false });
    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'ELIMINAR',
      recurso: 'proveedores',
      idRecurso: id,
      valorAnterior: { activo: true, documento: proveedor.tercero.numeroDocumento },
      valorNuevo: { activo: false },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { message: 'Proveedor desactivado (borrado lógico)' };
  }

  private async validarPuedeDesactivar(proveedor: Proveedor) {
    const pendientes = await consultarSaldosCompra(this.dataSource.manager, {
      idContraparte: proveedor.id,
      soloConSaldo: true,
    });
    if (pendientes.length) {
      const total = redondear(pendientes.reduce((acc, p) => acc + p.saldo, 0));
      throw new ConflictException(`El proveedor tiene ${pendientes.length} cuenta(s) por pagar por ${total}`);
    }
  }

  async findHistorialCompras(id: string, filtros: HistorialComprasDto = {}) {
    const proveedor = await this.findById(id);
    const pagina = normalizarPaginacion(filtros);
    const params: any[] = [id];
    const condiciones = ['fc.id_proveedor = $1'];
    if (filtros.desde) {
      params.push(filtros.desde.slice(0, 10));
      condiciones.push(`fc.fecha_emision >= $${params.length}`);
    }
    if (filtros.hasta) {
      params.push(filtros.hasta.slice(0, 10));
      condiciones.push(`fc.fecha_emision <= $${params.length}`);
    }
    const filas = await this.dataSource.query(
      `SELECT fc.id_factura_compra AS "idFacturaCompra", fc.numero_factura AS "numeroFactura",
              to_char(fc.fecha_emision, 'YYYY-MM-DD') AS "fechaEmision",
              to_char(fc.fecha_vencimiento, 'YYYY-MM-DD') AS "fechaVencimiento",
              e.codigo AS estado,
              ${SQL_TOTAL_FACTURA_COMPRA('fc')} AS monto,
              ${SQL_PAGADO_FACTURA_COMPRA('fc')} AS pagado
         FROM facturas_compra fc
         JOIN estados_factura_compra e ON e.id_estado = fc.id_estado
        WHERE ${condiciones.join(' AND ')}
        ORDER BY fc.fecha_emision DESC`,
      params,
    );
    const compras = filas.map((f: any) => ({
      ...f,
      monto: Number(f.monto),
      pagado: Number(f.pagado),
      saldo: f.estado === 'ANULADA' ? 0 : redondear(Number(f.monto) - Number(f.pagado)),
    }));
    const vigentes = compras.filter((c: any) => c.estado !== 'ANULADA');

    return {
      proveedorId: proveedor.id,
      razonSocial: proveedor.tercero.razonSocial,
      totalCompras: vigentes.length,
      montoTotal: redondear(vigentes.reduce((acc: number, c: any) => acc + c.monto, 0)),
      saldoPendiente: redondear(vigentes.reduce((acc: number, c: any) => acc + c.saldo, 0)),
      ...paginado(compras.slice(pagina.offset, pagina.offset + pagina.limit), compras.length, pagina),
    };
  }

  async findProductos(id: string) {
    const proveedor = await this.findById(id);
    const productos = await this.dataSource.query(
      `SELECT p.id_producto AS "idProducto", p.codigo, p.nombre,
              pp.codigo_proveedor AS "codigoProveedor", pp.costo_actual AS "costoActual",
              pp.dias_entrega AS "diasEntrega", pp.es_principal AS "esPrincipal"
         FROM producto_proveedor pp
         JOIN productos p ON p.id_producto = pp.id_producto
        WHERE pp.id_proveedor = $1
        ORDER BY p.codigo`,
      [id],
    );
    return {
      proveedorId: proveedor.id,
      razonSocial: proveedor.tercero.razonSocial,
      productosSuministrados: productos.map((p: any) => ({
        ...p,
        costoActual: p.costoActual === null ? null : Number(p.costoActual),
      })),
    };
  }

  async compararPrecios(productoId: string) {
    const [producto] = await this.dataSource.query(
      `SELECT id_producto, codigo, nombre FROM productos WHERE id_producto = $1`,
      [productoId],
    );
    if (!producto) throw new NotFoundException(`Producto con ID ${productoId} no encontrado`);

    const comparativa = await this.dataSource.query(
      `SELECT pr.id_proveedor AS "idProveedor", t.razon_social AS proveedor,
              pp.codigo_proveedor AS "codigoProveedor", pp.costo_actual AS costo,
              pp.dias_entrega AS "diasEntrega", pp.es_principal AS "esPrincipal"
         FROM producto_proveedor pp
         JOIN proveedores pr ON pr.id_proveedor = pp.id_proveedor
         JOIN terceros t ON t.id_tercero = pr.id_tercero
        WHERE pp.id_producto = $1
        ORDER BY pp.costo_actual ASC NULLS LAST`,
      [productoId],
    );

    return {
      productoId,
      codigo: producto.codigo,
      nombre: producto.nombre,
      comparativa: comparativa.map((c: any) => ({
        ...c,
        costo: c.costo === null ? null : Number(c.costo),
      })),
    };
  }
}
