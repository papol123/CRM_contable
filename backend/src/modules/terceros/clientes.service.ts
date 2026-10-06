import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Cliente } from '../../database/entities/cliente.entity';
import { Tercero } from '../../database/entities/tercero.entity';
import { Telefono, Email, Direccion } from '../../database/entities/contacto-datos.entity';
import {
  CreateClienteDto,
  ConsultaTercerosDto,
  HistorialComprasDto,
  UpdateClienteDto,
  UpdateCupoCreditoDto,
} from './dto/cliente.dto';
import { AddTelefonoDto, AddEmailDto } from './dto/proveedor-datos.dto';
import { consultarSaldosVenta, SQL_PAGADO_FACTURA_VENTA, SQL_TOTAL_FACTURA_VENTA } from '../../common/documentos/saldos';
import { redondear } from '../../common/documentos/totales';
import { ESTADOS_PEDIDO_CON_RESERVA } from '../../common/inventario/stock';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';

const PERMISO_CARTERA = 'cartera.gestionar';
const PERMISO_ELIMINAR = 'terceros.eliminar';

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
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(filtros: ConsultaTercerosDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.clienteRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.tercero', 't')
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

  /** El NIT/cédula es único. Cupo y plazo solo con cartera.gestionar. */
  async create(dto: CreateClienteDto, actor: Actor): Promise<Cliente> {
    if ((dto.cupoCredito || dto.diasPlazo) && !actor.permisos.includes(PERMISO_CARTERA)) {
      throw new ForbiddenException('Asignar cupo o plazo de crédito requiere el permiso cartera.gestionar');
    }
    const documento = dto.numeroDocumento.trim();
    const existing = await this.terceroRepository.findOne({ where: { numeroDocumento: documento } });
    if (existing) {
      throw new ConflictException(`Ya existe un tercero registrado con el documento ${documento}`);
    }

    // Tercero, datos de contacto y cliente se crean juntos o no se crea nada
    const idCliente = await this.dataSource.transaction(async (manager) => {
      const tercero = await manager.save(
        Tercero,
        manager.create(Tercero, {
          idTipoDocumento: dto.idTipoDocumento,
          numeroDocumento: documento,
          razonSocial: dto.razonSocial.trim(),
          tipoPersona: dto.tipoPersona,
          idCiudad: dto.idCiudad,
          responsabilidadesFiscales: dto.responsabilidadesFiscales,
          activo: true,
        }),
      );

      if (dto.telefono) {
        await manager.save(Telefono, { idTercero: tercero.id, numero: dto.telefono, tipo: 'MOVIL', principal: true });
      }
      if (dto.email) {
        await manager.save(Email, { idTercero: tercero.id, email: dto.email.toLowerCase(), tipo: 'GENERAL', principal: true });
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
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CREAR',
          recurso: 'clientes',
          idRecurso: cliente.id,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return cliente.id;
    });

    return this.findById(idCliente);
  }

  async update(id: string, dto: UpdateClienteDto, actor: Actor): Promise<Cliente> {
    const cliente = await this.findById(id);
    if (dto.activo !== undefined && dto.activo !== cliente.tercero.activo) {
      if (!actor.permisos.includes(PERMISO_ELIMINAR)) {
        throw new ForbiddenException('Activar o desactivar clientes requiere el permiso terceros.eliminar');
      }
      if (!dto.activo) await this.validarPuedeDesactivar(this.dataSource.manager, cliente);
    }

    const anterior = {
      razonSocial: cliente.tercero.razonSocial,
      tipoPersona: cliente.tercero.tipoPersona,
      idCiudad: cliente.tercero.idCiudad,
      activo: cliente.tercero.activo,
      responsabilidadesFiscales: cliente.tercero.responsabilidadesFiscales,
    };
    const cambios = {
      ...(dto.responsabilidadesFiscales !== undefined ? { responsabilidadesFiscales: dto.responsabilidadesFiscales } : {}),
      ...(dto.razonSocial ? { razonSocial: dto.razonSocial.trim() } : {}),
      ...(dto.tipoPersona ? { tipoPersona: dto.tipoPersona } : {}),
      ...(dto.idCiudad !== undefined ? { idCiudad: dto.idCiudad } : {}),
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
    };
    if (Object.keys(cambios).length) {
      await this.terceroRepository.update(cliente.tercero.id, cambios);
      await this.auditoria.registrar({
        idUsuario: actor.id,
        accion: 'ACTUALIZAR',
        recurso: 'clientes',
        idRecurso: id,
        valorAnterior: anterior,
        valorNuevo: cambios,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    }
    return this.findById(id);
  }

  /** Borrado lógico: se impide si tiene saldo pendiente o pedidos abiertos (integridad histórica). */
  async remove(id: string, actor: Actor): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const cliente = await this.findById(id);
      if (!cliente.tercero.activo) throw new ConflictException('El cliente ya está inactivo');
      await this.validarPuedeDesactivar(manager, cliente);
      await manager.update(Tercero, cliente.tercero.id, { activo: false });
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ELIMINAR',
          recurso: 'clientes',
          idRecurso: id,
          valorAnterior: { activo: true, documento: cliente.tercero.numeroDocumento },
          valorNuevo: { activo: false },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return { message: 'Cliente desactivado (borrado lógico)' };
    });
  }

  private async validarPuedeDesactivar(db: EntityManager, cliente: Cliente) {
    const saldos = await consultarSaldosVenta(db, { idContraparte: cliente.id, soloConSaldo: true });
    if (saldos.length) {
      const total = redondear(saldos.reduce((acc, s) => acc + s.saldo, 0));
      throw new ConflictException(`El cliente tiene ${saldos.length} remisión(es) con saldo pendiente por ${total}`);
    }
    const [{ abiertos }] = await db.query(
      `SELECT COUNT(*)::int AS abiertos FROM pedidos WHERE id_cliente = $1 AND estado = ANY($2)`,
      [cliente.id, ESTADOS_PEDIDO_CON_RESERVA],
    );
    if (abiertos > 0) throw new ConflictException(`El cliente tiene ${abiertos} pedido(s) abiertos`);
  }

  async findTelefonos(id: string): Promise<Telefono[]> {
    const cliente = await this.findById(id);
    return this.telefonoRepository.find({ where: { idTercero: cliente.tercero.id } });
  }

  async addTelefono(id: string, dto: AddTelefonoDto): Promise<Telefono> {
    const cliente = await this.findById(id);
    return this.telefonoRepository.save(this.telefonoRepository.create({ idTercero: cliente.tercero.id, ...dto }));
  }

  async removeTelefono(id: string, telId: string): Promise<{ message: string }> {
    const cliente = await this.findById(id);
    const tel = await this.telefonoRepository.findOne({ where: { id: telId, idTercero: cliente.tercero.id } });
    if (!tel) throw new NotFoundException('Teléfono no encontrado para este cliente');
    await this.telefonoRepository.remove(tel);
    return { message: 'Teléfono eliminado' };
  }

  async findCorreos(id: string): Promise<Email[]> {
    const cliente = await this.findById(id);
    return this.emailRepository.find({ where: { idTercero: cliente.tercero.id } });
  }

  async addCorreo(id: string, dto: AddEmailDto): Promise<Email> {
    const cliente = await this.findById(id);
    const email = dto.email.toLowerCase().trim();
    const existe = await this.emailRepository.count({ where: { idTercero: cliente.tercero.id, email } });
    if (existe) throw new ConflictException(`El cliente ya tiene registrado el correo ${email}`);
    return this.emailRepository.save(this.emailRepository.create({ idTercero: cliente.tercero.id, ...dto, email }));
  }

  /** Remisiones del cliente, filtrables por fechas (catálogo §6). */
  async findHistorialCompras(id: string, filtros: HistorialComprasDto = {}) {
    const cliente = await this.findById(id);
    const pagina = normalizarPaginacion(filtros);
    const params = [id, filtros.desde?.slice(0, 10) ?? null, filtros.hasta?.slice(0, 10) ?? null];

    const [resumen] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE NOT f.anulada)::int AS remisiones,
              COUNT(*)::int AS total_filas,
              COALESCE(SUM(${SQL_TOTAL_FACTURA_VENTA}) FILTER (WHERE NOT f.anulada), 0) AS comprado
         FROM facturas_venta f
        WHERE f.id_cliente = $1
          AND ($2::date IS NULL OR f.fecha_expedicion >= $2::date)
          AND ($3::date IS NULL OR f.fecha_expedicion <= $3::date)`,
      params,
    );
    const filas = await this.dataSource.query(
      `SELECT f.id_factura_venta AS "idFactura", f.numero_venta AS "numero",
              to_char(f.fecha_expedicion, 'YYYY-MM-DD') AS fecha, e.codigo AS estado, f.anulada,
              ${SQL_TOTAL_FACTURA_VENTA} AS total,
              (SELECT COUNT(*) FROM detalle_factura_venta d WHERE d.id_factura_venta = f.id_factura_venta) AS items
         FROM facturas_venta f
         JOIN estados_factura_venta e ON e.id_estado = f.id_estado
        WHERE f.id_cliente = $1
          AND ($2::date IS NULL OR f.fecha_expedicion >= $2::date)
          AND ($3::date IS NULL OR f.fecha_expedicion <= $3::date)
        ORDER BY f.fecha_expedicion DESC, f.numero_venta DESC
        LIMIT $4 OFFSET $5`,
      [...params, pagina.limit, pagina.offset],
    );

    return {
      clienteId: cliente.id,
      razonSocial: cliente.tercero.razonSocial,
      documento: cliente.tercero.numeroDocumento,
      totalRemisiones: resumen.remisiones,
      totalComprado: redondear(Number(resumen.comprado)),
      ...paginado(
        filas.map((f: any) => ({ ...f, total: Number(f.total), items: Number(f.items) })),
        resumen.total_filas,
        pagina,
      ),
    };
  }

  /** Estado de cuenta: remisiones pendientes, abonos, saldo y días de mora. */
  async findCartera(id: string) {
    const cliente = await this.findById(id);
    const pendientes = await consultarSaldosVenta(this.dataSource.manager, { idContraparte: id, soloConSaldo: true });
    const saldoPendiente = redondear(pendientes.reduce((acc, f) => acc + f.saldo, 0));
    const saldoVencido = redondear(pendientes.filter((f) => f.diasMora > 0).reduce((acc, f) => acc + f.saldo, 0));

    const abonos = await this.dataSource.query(
      `SELECT p.id_pago AS "idPago", p.fecha_pago AS "fechaPago", f.numero_venta AS "remision",
              a.monto_aplicado AS "monto", mp.nombre AS "medioPago"
         FROM aplicacion_pago_venta a
         JOIN pagos p ON p.id_pago = a.id_pago
         JOIN estados_pago ep ON ep.id_estado = p.id_estado AND ep.codigo <> 'ANULADO'
         JOIN metodos_pago mp ON mp.id_metodo_pago = p.id_metodo_pago
         JOIN facturas_venta f ON f.id_factura_venta = a.id_factura_venta
        WHERE f.id_cliente = $1 AND ${SQL_TOTAL_FACTURA_VENTA} - ${SQL_PAGADO_FACTURA_VENTA} > 0
        ORDER BY p.fecha_pago DESC`,
      [id],
    );

    return {
      clienteId: cliente.id,
      razonSocial: cliente.tercero.razonSocial,
      cupoCredito: Number(cliente.cupoCredito),
      diasPlazo: cliente.diasPlazo,
      creditoBloqueado: cliente.creditoBloqueado,
      motivoBloqueo: cliente.motivoBloqueo,
      saldoPendiente,
      saldoVencido,
      creditoDisponible: cliente.creditoBloqueado
        ? 0
        : redondear(Math.max(0, Number(cliente.cupoCredito) - saldoPendiente)),
      diasMoraMaximo: pendientes.reduce((max, f) => Math.max(max, f.diasMora), 0),
      remisionesPendientes: pendientes,
      abonos: abonos.map((a: any) => ({ ...a, monto: Number(a.monto) })),
    };
  }

  async updateCupoCredito(id: string, dto: UpdateCupoCreditoDto, actor: Actor): Promise<Cliente> {
    const cliente = await this.findById(id);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Cliente, id, { cupoCredito: dto.cupoCredito, diasPlazo: dto.diasPlazo });
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'CAMBIAR_CUPO_CREDITO',
          recurso: 'clientes',
          idRecurso: id,
          valorAnterior: { cupoCredito: Number(cliente.cupoCredito), diasPlazo: cliente.diasPlazo },
          valorNuevo: { cupoCredito: dto.cupoCredito, diasPlazo: dto.diasPlazo },
          motivo: dto.motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.findById(id);
  }

  /** Impide nuevas ventas a crédito sin perder el cupo configurado. */
  async bloquearCredito(id: string, motivo: string, actor: Actor): Promise<Cliente> {
    return this.cambiarBloqueo(id, true, motivo, actor);
  }

  async desbloquearCredito(id: string, motivo: string, actor: Actor): Promise<Cliente> {
    return this.cambiarBloqueo(id, false, motivo, actor);
  }

  private async cambiarBloqueo(id: string, bloquear: boolean, motivo: string, actor: Actor) {
    const cliente = await this.findById(id);
    if (cliente.creditoBloqueado === bloquear) {
      throw new ConflictException(`El crédito del cliente ya está ${bloquear ? 'bloqueado' : 'desbloqueado'}`);
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Cliente, id, { creditoBloqueado: bloquear, motivoBloqueo: bloquear ? motivo : null });
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: bloquear ? 'BLOQUEAR_CREDITO' : 'DESBLOQUEAR_CREDITO',
          recurso: 'clientes',
          idRecurso: id,
          valorAnterior: { creditoBloqueado: !bloquear },
          valorNuevo: { creditoBloqueado: bloquear },
          motivo,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.findById(id);
  }

  async importar(items: CreateClienteDto[], actor: Actor) {
    let importados = 0;
    const errores: Array<{ indice: number; documento: string; error: string }> = [];
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i], actor);
        importados++;
      } catch (err: any) {
        errores.push({ indice: i, documento: items[i].numeroDocumento, error: err.message });
      }
    }
    return { total: items.length, importados, fallidos: errores.length, errores };
  }
}
