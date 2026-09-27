import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Proveedor } from '../../database/entities/proveedor.entity';
import { Tercero } from '../../database/entities/tercero.entity';
import { Telefono, Email } from '../../database/entities/contacto-datos.entity';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor-datos.dto';
import { SQL_PAGADO_FACTURA_COMPRA, SQL_TOTAL_FACTURA_COMPRA } from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Proveedor)
    private readonly proveedorRepository: Repository<Proveedor>,
    @InjectRepository(Tercero)
    private readonly terceroRepository: Repository<Tercero>,
  ) {}

  async findAll(search?: string): Promise<Proveedor[]> {
    const query = this.proveedorRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.tercero', 't')
      .leftJoinAndSelect('t.tipoDocumento', 'td')
      .leftJoinAndSelect('t.ciudad', 'cd')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.emails', 'em')
      .orderBy('t.razonSocial', 'ASC');

    if (search && search.trim() !== '') {
      query.andWhere(
        '(LOWER(t.razonSocial) LIKE :search OR LOWER(t.numeroDocumento) LIKE :search)',
        { search: `%${search.trim().toLowerCase()}%` },
      );
    }

    return query.getMany();
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

  async create(dto: CreateProveedorDto): Promise<Proveedor> {
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
          email: dto.email,
          tipo: 'VENTAS',
          principal: true,
        });
      }

      const proveedor = await manager.save(
        Proveedor,
        manager.create(Proveedor, { idTercero: tercero.id, diasPlazo: dto.diasPlazo || 0 }),
      );
      return proveedor.id;
    });

    return this.findById(idProveedor);
  }

  async update(id: string, dto: UpdateProveedorDto): Promise<Proveedor> {
    const proveedor = await this.findById(id);

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

    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const proveedor = await this.findById(id);
    await this.terceroRepository.update(proveedor.tercero.id, { activo: false });
    return { message: 'Proveedor desactivado exitosamente (borrado lógico)' };
  }

  async findHistorialCompras(id: string) {
    const proveedor = await this.findById(id);
    const filas = await this.dataSource.query(
      `SELECT fc.id_factura_compra AS "idFacturaCompra", fc.numero_factura AS "numeroFactura",
              to_char(fc.fecha_emision, 'YYYY-MM-DD') AS "fechaEmision",
              to_char(fc.fecha_vencimiento, 'YYYY-MM-DD') AS "fechaVencimiento",
              e.codigo AS estado,
              ${SQL_TOTAL_FACTURA_COMPRA('fc')} AS monto,
              ${SQL_PAGADO_FACTURA_COMPRA('fc')} AS pagado
         FROM facturas_compra fc
         JOIN estados_factura_compra e ON e.id_estado = fc.id_estado
        WHERE fc.id_proveedor = $1
        ORDER BY fc.fecha_emision DESC`,
      [id],
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
      compras,
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
