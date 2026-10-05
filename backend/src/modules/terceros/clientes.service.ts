import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cliente } from '../../database/entities/cliente.entity';
import { Tercero } from '../../database/entities/tercero.entity';
import { Telefono, Email, Direccion } from '../../database/entities/contacto-datos.entity';
import {
  CreateClienteDto,
  UpdateClienteDto,
  UpdateCupoCreditoDto,
} from './dto/cliente.dto';
import { AddTelefonoDto, AddEmailDto } from './dto/proveedor-datos.dto';
import { consultarSaldosVenta, SQL_TOTAL_FACTURA_VENTA } from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';

@Injectable()
export class ClientesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
    @InjectRepository(Tercero)
    private readonly terceroRepository: Repository<Tercero>,
    @InjectRepository(Telefono)
    private readonly telefonoRepository: Repository<Telefono>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
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
      where: { numeroDocumento: dto.numeroDocumento.trim() },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un tercero registrado con el documento ${dto.numeroDocumento}`,
      );
    }

    // Tercero, datos de contacto y cliente se crean juntos o no se crea nada
    const idCliente = await this.dataSource.transaction(async (manager) => {
      const tercero = await manager.save(
        Tercero,
        manager.create(Tercero, {
          idTipoDocumento: dto.idTipoDocumento,
          numeroDocumento: dto.numeroDocumento.trim(),
          razonSocial: dto.razonSocial.trim(),
          tipoPersona: dto.tipoPersona,
          idCiudad: dto.idCiudad,
          responsabilidadesFiscales: dto.responsabilidadesFiscales,
          activo: true,
        }),
      );

      if (dto.telefono) {
        await manager.save(Telefono, {
          idTercero: tercero.id,
          numero: dto.telefono,
          tipo: 'MOVIL',
          principal: true,
        });
      }
      if (dto.email) {
        await manager.save(Email, {
          idTercero: tercero.id,
          email: dto.email,
          tipo: 'GENERAL',
          principal: true,
        });
      }
      if (dto.direccion) {
        await manager.save(Direccion, {
          idTercero: tercero.id,
          idCiudad: dto.idCiudad,
          direccion: dto.direccion,
          tipo: 'PRINCIPAL',
          principal: true,
        });
      }

      const cliente = await manager.save(
        Cliente,
        manager.create(Cliente, {
          idTercero: tercero.id,
          cupoCredito: dto.cupoCredito || 0,
          diasPlazo: dto.diasPlazo || 0,
        }),
      );
      return cliente.id;
    });

    return this.findById(idCliente);
  }

  async update(id: string, dto: UpdateClienteDto): Promise<Cliente> {
    const cliente = await this.findById(id);

    if (
      dto.razonSocial ||
      dto.tipoPersona ||
      dto.idCiudad !== undefined ||
      dto.activo !== undefined ||
      dto.responsabilidadesFiscales !== undefined
    ) {
      await this.terceroRepository.update(cliente.tercero.id, {
        ...(dto.responsabilidadesFiscales !== undefined
          ? { responsabilidadesFiscales: dto.responsabilidadesFiscales }
          : {}),
        ...(dto.razonSocial ? { razonSocial: dto.razonSocial.trim() } : {}),
        ...(dto.tipoPersona ? { tipoPersona: dto.tipoPersona } : {}),
        ...(dto.idCiudad !== undefined ? { idCiudad: dto.idCiudad } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      });
    }

    if (dto.cupoCredito !== undefined || dto.diasPlazo !== undefined) {
      await this.clienteRepository.update(id, {
        ...(dto.cupoCredito !== undefined ? { cupoCredito: dto.cupoCredito } : {}),
        ...(dto.diasPlazo !== undefined ? { diasPlazo: dto.diasPlazo } : {}),
      });
    }

    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const cliente = await this.findById(id);
    await this.terceroRepository.update(cliente.tercero.id, { activo: false });
    return { message: 'Cliente desactivado exitosamente (borrado lógico)' };
  }

  async findTelefonos(id: string): Promise<Telefono[]> {
    const cliente = await this.findById(id);
    return this.telefonoRepository.find({ where: { idTercero: cliente.tercero.id } });
  }

  async addTelefono(id: string, dto: AddTelefonoDto): Promise<Telefono> {
    const cliente = await this.findById(id);
    return this.telefonoRepository.save(
      this.telefonoRepository.create({ idTercero: cliente.tercero.id, ...dto }),
    );
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
    return this.emailRepository.save(
      this.emailRepository.create({ idTercero: cliente.tercero.id, ...dto }),
    );
  }

  async findHistorialCompras(id: string) {
    const cliente = await this.findById(id);
    const facturas = await this.dataSource.query(
      `SELECT f.id_factura_venta AS "idFactura", f.numero_venta AS "numeroFactura",
              to_char(f.fecha_expedicion, 'YYYY-MM-DD') AS fecha, e.codigo AS estado, f.anulada,
              ${SQL_TOTAL_FACTURA_VENTA('f')} AS total,
              (SELECT COUNT(*) FROM detalle_factura_venta d WHERE d.id_factura_venta = f.id_factura_venta) AS items
         FROM facturas_venta f
         JOIN estados_factura_venta e ON e.id_estado = f.id_estado
        WHERE f.id_cliente = $1
        ORDER BY f.fecha_expedicion DESC, f.numero_venta DESC`,
      [id],
    );
    const historial = facturas.map((f: any) => ({ ...f, total: Number(f.total), items: Number(f.items) }));
    const vigentes = historial.filter((f: any) => !f.anulada);

    return {
      clienteId: cliente.id,
      razonSocial: cliente.tercero.razonSocial,
      documento: cliente.tercero.numeroDocumento,
      totalFacturas: vigentes.length,
      totalComprado: redondear(vigentes.reduce((acc: number, f: any) => acc + f.total, 0)),
      historial,
    };
  }

  async findCartera(id: string) {
    const cliente = await this.findById(id);
    const pendientes = await consultarSaldosVenta(this.dataSource.manager, {
      idContraparte: id,
      soloConSaldo: true,
    });
    const saldoPendiente = redondear(pendientes.reduce((acc, f) => acc + f.saldo, 0));
    const saldoVencido = redondear(
      pendientes.filter((f) => f.diasMora > 0).reduce((acc, f) => acc + f.saldo, 0),
    );

    return {
      clienteId: cliente.id,
      razonSocial: cliente.tercero.razonSocial,
      cupoCredito: Number(cliente.cupoCredito),
      diasPlazo: cliente.diasPlazo,
      saldoPendiente,
      saldoVencido,
      creditoDisponible: redondear(Math.max(0, Number(cliente.cupoCredito) - saldoPendiente)),
      diasMoraMaximo: pendientes.reduce((max, f) => Math.max(max, f.diasMora), 0),
      facturasPendientes: pendientes,
    };
  }

  async updateCupoCredito(id: string, dto: UpdateCupoCreditoDto): Promise<Cliente> {
    await this.findById(id);
    await this.clienteRepository.update(id, { cupoCredito: dto.cupoCredito, diasPlazo: dto.diasPlazo });
    return this.findById(id);
  }

  async bloquearCredito(id: string): Promise<Cliente> {
    await this.findById(id);
    await this.clienteRepository.update(id, { cupoCredito: 0 });
    return this.findById(id);
  }

  async desbloquearCredito(id: string, nuevoCupo: number = 5000000): Promise<Cliente> {
    await this.findById(id);
    await this.clienteRepository.update(id, { cupoCredito: nuevoCupo });
    return this.findById(id);
  }
}
