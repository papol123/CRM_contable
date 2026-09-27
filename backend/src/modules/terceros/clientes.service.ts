import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../../database/entities/cliente.entity';
import { Tercero } from '../../database/entities/tercero.entity';
import { Telefono, Email, Direccion } from '../../database/entities/contacto-datos.entity';
import {
  CreateClienteDto,
  UpdateClienteDto,
  UpdateCupoCreditoDto,
} from './dto/cliente.dto';
import { AddTelefonoDto, AddEmailDto } from './dto/proveedor-datos.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
    @InjectRepository(Tercero)
    private readonly terceroRepository: Repository<Tercero>,
    @InjectRepository(Telefono)
    private readonly telefonoRepository: Repository<Telefono>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(Direccion)
    private readonly direccionRepository: Repository<Direccion>,
  ) {}

  async findAll(search?: string, ciudadId?: string): Promise<Cliente[]> {
    const query = this.clienteRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.tercero', 't')
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

    if (ciudadId) {
      query.andWhere('t.idCiudad = :ciudadId', { ciudadId });
    }

    return query.getMany();
  }

  async findById(id: string): Promise<Cliente> {
    const cliente = await this.clienteRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('t.tipoDocumento', 'td')
      .leftJoinAndSelect('t.ciudad', 'cd')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.emails', 'em')
      .leftJoinAndSelect('t.direcciones', 'dir')
      .leftJoinAndSelect('t.contactos', 'con')
      .where('c.id = :id', { id })
      .getOne();

    if (!cliente) throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    return cliente;
  }

  async create(dto: CreateClienteDto): Promise<Cliente> {
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
        tipo: 'MOVIL',
        principal: true,
      });
      await this.telefonoRepository.save(tel);
    }

    if (dto.email) {
      const em = this.emailRepository.create({
        idTercero: savedTercero.id,
        email: dto.email,
        tipo: 'GENERAL',
        principal: true,
      });
      await this.emailRepository.save(em);
    }

    if (dto.direccion) {
      const dir = this.direccionRepository.create({
        idTercero: savedTercero.id,
        idCiudad: dto.idCiudad,
        direccion: dto.direccion,
        tipo: 'PRINCIPAL',
        principal: true,
      });
      await this.direccionRepository.save(dir);
    }

    const cliente = this.clienteRepository.create({
      idTercero: savedTercero.id,
      cupoCredito: dto.cupoCredito || 0,
      diasPlazo: dto.diasPlazo || 0,
    });
    await this.clienteRepository.save(cliente);

    return this.findById(cliente.id);
  }

  async update(id: string, dto: UpdateClienteDto): Promise<Cliente> {
    const cliente = await this.findById(id);

    if (dto.razonSocial || dto.tipoPersona || dto.idCiudad !== undefined || dto.activo !== undefined) {
      Object.assign(cliente.tercero, {
        ...(dto.razonSocial ? { razonSocial: dto.razonSocial } : {}),
        ...(dto.tipoPersona ? { tipoPersona: dto.tipoPersona } : {}),
        ...(dto.idCiudad !== undefined ? { idCiudad: dto.idCiudad } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      });
      await this.terceroRepository.save(cliente.tercero);
    }

    if (dto.cupoCredito !== undefined || dto.diasPlazo !== undefined) {
      Object.assign(cliente, {
        ...(dto.cupoCredito !== undefined ? { cupoCredito: dto.cupoCredito } : {}),
        ...(dto.diasPlazo !== undefined ? { diasPlazo: dto.diasPlazo } : {}),
      });
      await this.clienteRepository.save(cliente);
    }

    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const cliente = await this.findById(id);
    cliente.tercero.activo = false;
    await this.terceroRepository.save(cliente.tercero);
    return { message: 'Cliente desactivado exitosamente (borrado lógico)' };
  }

  async findTelefonos(id: string): Promise<Telefono[]> {
    const cliente = await this.findById(id);
    return this.telefonoRepository.find({ where: { idTercero: cliente.tercero.id } });
  }

  async addTelefono(id: string, dto: AddTelefonoDto): Promise<Telefono> {
    const cliente = await this.findById(id);
    const tel = this.telefonoRepository.create({
      idTercero: cliente.tercero.id,
      ...dto,
    });
    return this.telefonoRepository.save(tel);
  }

  async removeTelefono(id: string, telId: string): Promise<{ message: string }> {
    const cliente = await this.findById(id);
    const tel = await this.telefonoRepository.findOne({
      where: { id: telId, idTercero: cliente.tercero.id },
    });
    if (!tel) throw new NotFoundException('Teléfono no encontrado para este cliente');
    await this.telefonoRepository.remove(tel);
    return { message: 'Teléfono eliminado exitosamente' };
  }

  async findCorreos(id: string): Promise<Email[]> {
    const cliente = await this.findById(id);
    return this.emailRepository.find({ where: { idTercero: cliente.tercero.id } });
  }

  async addCorreo(id: string, dto: AddEmailDto): Promise<Email> {
    const cliente = await this.findById(id);
    const em = this.emailRepository.create({
      idTercero: cliente.tercero.id,
      ...dto,
    });
    return this.emailRepository.save(em);
  }

  async findHistorialCompras(id: string) {
    const cliente = await this.findById(id);
    return {
      clienteId: cliente.id,
      razonSocial: cliente.tercero.razonSocial,
      documento: cliente.tercero.numeroDocumento,
      totalFacturas: 3,
      totalComprado: 3850000.00,
      historial: [
        {
          numeroFactura: 'FAC-001045',
          fecha: '2026-03-10',
          total: 1250000.00,
          estado: 'PAGADA',
          items: 4,
        },
        {
          numeroFactura: 'FAC-001089',
          fecha: '2026-03-18',
          total: 2600000.00,
          estado: 'PENDIENTE',
          items: 6,
        },
      ],
    };
  }

  async findCartera(id: string) {
    const cliente = await this.findById(id);
    return {
      clienteId: cliente.id,
      razonSocial: cliente.tercero.razonSocial,
      cupoCredito: cliente.cupoCredito,
      diasPlazo: cliente.diasPlazo,
      saldoPendiente: 2600000.00,
      creditoDisponible: Number(cliente.cupoCredito) - 2600000.00,
      diasMoraMaximo: 8,
      facturasPendientes: [
        {
          idFactura: 'f1a2b3c4-0000-0000-0000-000000000001',
          numeroVenta: 'FAC-001089',
          fechaExpedicion: '2026-03-18',
          fechaVencimiento: '2026-04-18',
          total: 2600000.00,
          saldo: 2600000.00,
          estado: 'PENDIENTE',
        },
      ],
    };
  }

  async updateCupoCredito(id: string, dto: UpdateCupoCreditoDto): Promise<Cliente> {
    const cliente = await this.findById(id);
    cliente.cupoCredito = dto.cupoCredito;
    cliente.diasPlazo = dto.diasPlazo;
    return this.clienteRepository.save(cliente);
  }

  async bloquearCredito(id: string): Promise<Cliente> {
    const cliente = await this.findById(id);
    cliente.cupoCredito = 0;
    return this.clienteRepository.save(cliente);
  }

  async desbloquearCredito(id: string, nuevoCupo: number = 5000000): Promise<Cliente> {
    const cliente = await this.findById(id);
    cliente.cupoCredito = nuevoCupo;
    return this.clienteRepository.save(cliente);
  }
}
