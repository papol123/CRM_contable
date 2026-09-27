import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proveedor } from '../../database/entities/proveedor.entity';
import { Tercero } from '../../database/entities/tercero.entity';
import { Telefono, Email } from '../../database/entities/contacto-datos.entity';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor-datos.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor)
    private readonly proveedorRepository: Repository<Proveedor>,
    @InjectRepository(Tercero)
    private readonly terceroRepository: Repository<Tercero>,
    @InjectRepository(Telefono)
    private readonly telefonoRepository: Repository<Telefono>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
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
      where: { numeroDocumento: dto.numeroDocumento },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un tercero registrado con el documento ${dto.numeroDocumento}`,
      );
    }

    const tercero = this.terceroRepository.create({
      idTipoDocumento: dto.idTipoDocumento,
      numeroDocumento: dto.numeroDocumento,
      razonSocial: dto.razonSocial,
      tipoPersona: dto.tipoPersona,
      idCiudad: dto.idCiudad,
      activo: true,
    });
    const savedTercero = await this.terceroRepository.save(tercero);

    if (dto.telefono) {
      const tel = this.telefonoRepository.create({
        idTercero: savedTercero.id,
        numero: dto.telefono,
        tipo: 'FIJO',
        principal: true,
      });
      await this.telefonoRepository.save(tel);
    }

    if (dto.email) {
      const em = this.emailRepository.create({
        idTercero: savedTercero.id,
        email: dto.email,
        tipo: 'VENTAS',
        principal: true,
      });
      await this.emailRepository.save(em);
    }

    const proveedor = this.proveedorRepository.create({
      idTercero: savedTercero.id,
      diasPlazo: dto.diasPlazo || 0,
    });
    await this.proveedorRepository.save(proveedor);

    return this.findById(proveedor.id);
  }

  async update(id: string, dto: UpdateProveedorDto): Promise<Proveedor> {
    const proveedor = await this.findById(id);

    if (dto.razonSocial || dto.idCiudad !== undefined || dto.activo !== undefined) {
      Object.assign(proveedor.tercero, {
        ...(dto.razonSocial ? { razonSocial: dto.razonSocial } : {}),
        ...(dto.idCiudad !== undefined ? { idCiudad: dto.idCiudad } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      });
      await this.terceroRepository.save(proveedor.tercero);
    }

    if (dto.diasPlazo !== undefined) {
      proveedor.diasPlazo = dto.diasPlazo;
      await this.proveedorRepository.save(proveedor);
    }

    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const proveedor = await this.findById(id);
    proveedor.tercero.activo = false;
    await this.terceroRepository.save(proveedor.tercero);
    return { message: 'Proveedor desactivado exitosamente (borrado lógico)' };
  }

  async findHistorialCompras(id: string) {
    const proveedor = await this.findById(id);
    return {
      proveedorId: proveedor.id,
      razonSocial: proveedor.tercero.razonSocial,
      totalCompras: 2,
      montoTotal: 8450000.00,
      compras: [
        {
          numeroFactura: 'FAC-PROV-9921',
          fechaEmision: '2026-02-15',
          monto: 3950000.00,
          estado: 'PAGADA',
        },
        {
          numeroFactura: 'FAC-PROV-9988',
          fechaEmision: '2026-03-05',
          monto: 4500000.00,
          estado: 'PENDIENTE',
        },
      ],
    };
  }

  async findProductos(id: string) {
    const proveedor = await this.findById(id);
    return {
      proveedorId: proveedor.id,
      razonSocial: proveedor.tercero.razonSocial,
      productosSuministrados: [
        {
          codigo: 'REP-FRE-001',
          nombre: 'Pastillas de Freno Delanteras Brembo Cerámica',
          codigoProveedor: 'BRM-P06024N',
          costoActual: 120000.00,
          diasEntrega: 3,
        },
        {
          codigo: 'REP-FRE-002',
          nombre: 'Disco de Freno Ventilado Delantero Fremax',
          codigoProveedor: 'FMX-BD5421',
          costoActual: 185000.00,
          diasEntrega: 3,
        },
      ],
    };
  }

  async compararPrecios(productoId: string) {
    return {
      productoId,
      comparativa: [
        {
          proveedor: 'Importadora Frenos & Suspensiones del Valle SAS',
          costo: 120000.00,
          diasEntrega: 3,
          esPrincipal: true,
        },
        {
          proveedor: 'Distribuidora Automotriz de Colombia SAS',
          costo: 126000.00,
          diasEntrega: 2,
          esPrincipal: false,
        },
      ],
    };
  }
}
