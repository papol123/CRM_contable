import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Cotizacion, DetalleCotizacion } from '../../database/entities/cotizacion.entity';
import { Cliente } from '../../database/entities/cliente.entity';
import { Producto } from '../../database/entities/producto.entity';
import {
  ConsultaCotizacionesDto,
  CreateCotizacionDto,
  UpdateCotizacionDto,
  ConvertirCotizacionDto,
} from './dto/ventas-documentos.dto';
import { ItemFacturaVentaDto } from './dto/factura-venta.dto';
import { calcularLinea, calcularTotales } from '../../common/documentos/totales';
import { fechaHoy, sumarDias } from '../../common/utils/fechas';
import { PedidosService } from './pedidos.service';
import { normalizarPaginacion, paginado } from '../../common/paginacion/paginacion';
import { PdfService } from '../../common/pdf/pdf.service';
import { JobsService } from '../../common/jobs/jobs.service';
import { CorreoService } from '../../common/correo/correo.service';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';

const DIAS_VIGENCIA_POR_DEFECTO = 15;
const JOB_ENVIAR_COTIZACION = 'ENVIAR_COTIZACION';

@Injectable()
export class CotizacionesService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cotizacion)
    private readonly cotizacionRepository: Repository<Cotizacion>,
    private readonly pedidosService: PedidosService,
    private readonly pdf: PdfService,
    private readonly jobs: JobsService,
    private readonly correo: CorreoService,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  onModuleInit() {
    // Envío asíncrono (catálogo §10): genera el PDF, lo guarda en el almacenamiento y lo envía por correo
    this.jobs.registrar(JOB_ENVIAR_COTIZACION, async (job) => {
      const { idCotizacion, email } = job.parametros || {};
      const { contenido, nombre, numero, cliente } = await this.generarPdf(idCotizacion);
      const ruta = this.almacenamiento.generarRuta('cotizaciones', '.pdf');
      await this.almacenamiento.guardar(ruta, contenido, 'application/pdf');
      await this.dataSource.query(
        `INSERT INTO adjuntos_documento (tabla, id_registro, nombre_archivo, url, tipo_mime, tamano_bytes)
         VALUES ('cotizaciones', $1, $2, $3, 'application/pdf', $4)`,
        [idCotizacion, nombre, ruta, contenido.length],
      );
      await this.correo.enviar({
        para: email,
        asunto: `Cotización ${numero}`,
        texto: `Estimado(a) ${cliente}:\n\nAdjuntamos la cotización ${numero}. Quedamos atentos a sus comentarios.\n\nCordialmente,`,
        adjuntos: [{ nombre, contenido, tipoMime: 'application/pdf' }],
      });
      return { rutaArchivo: ruta, resumen: { cotizacion: numero, destinatario: email } };
    });
  }

  async findAll(filtros: ConsultaCotizacionesDto = {}) {
    const pagina = normalizarPaginacion(filtros);
    const query = this.cotizacionRepository
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.cliente', 'cl')
      .innerJoinAndSelect('cl.tercero', 't')
      .leftJoinAndSelect('c.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.numero', 'DESC')
      .skip(pagina.offset)
      .take(pagina.limit);

    if (filtros.estado) query.andWhere('c.estado = :estado', { estado: filtros.estado });
    if (filtros.clienteId) query.andWhere('c.idCliente = :idCliente', { idCliente: filtros.clienteId });

    const [cotizaciones, total] = await query.getManyAndCount();
    return paginado(cotizaciones.map((c) => this.conTotales(c)), total, pagina);
  }

  async findById(id: string): Promise<any> {
    return this.conTotales(await this.obtener(id));
  }

  async create(dto: CreateCotizacionDto, idUsuario?: string): Promise<any> {
    const id = await this.dataSource.transaction(async (manager) => {
      const cliente = await manager.findOne(Cliente, { where: { id: dto.idCliente } });
      if (!cliente) throw new NotFoundException(`Cliente con ID ${dto.idCliente} no encontrado`);
      if (!cliente.tercero?.activo) throw new UnprocessableEntityException('El cliente está inactivo');

      const fecha = fechaHoy();
      const vigenteHasta = dto.vigenteHasta?.slice(0, 10) || sumarDias(fecha, DIAS_VIGENCIA_POR_DEFECTO);
      if (vigenteHasta < fecha) {
        throw new BadRequestException('La vigencia no puede ser anterior a hoy');
      }

      const [{ numero }] = await manager.query(
        `SELECT 'COT-' || LPAD(nextval('seq_cotizaciones')::text, 5, '0') AS numero`,
      );

      const cotizacion = await manager.save(
        Cotizacion,
        manager.create(Cotizacion, {
          numero,
          idCliente: dto.idCliente,
          idUsuario,
          fecha,
          vigenteHasta,
          estado: 'BORRADOR',
          observacion: dto.observacion,
        }),
      );
      await this.guardarItems(manager, cotizacion.id, dto.items || []);
      return cotizacion.id;
    });
    return this.findById(id);
  }

  async update(id: string, dto: UpdateCotizacionDto): Promise<any> {
    await this.dataSource.transaction(async (manager) => {
      const cotizacion = await this.obtener(id, manager);
      if (cotizacion.estado !== 'BORRADOR') {
        throw new ConflictException(`Solo se editan cotizaciones en BORRADOR (estado actual: ${cotizacion.estado})`);
      }
      const cambios: Partial<Cotizacion> = {};
      if (dto.observacion !== undefined) cambios.observacion = dto.observacion;
      if (dto.vigenteHasta) cambios.vigenteHasta = dto.vigenteHasta.slice(0, 10);
      if (Object.keys(cambios).length > 0) await manager.update(Cotizacion, id, cambios);

      if (dto.items) {
        await manager.delete(DetalleCotizacion, { idCotizacion: id });
        await this.guardarItems(manager, id, dto.items);
      }
    });
    return this.findById(id);
  }

  async aprobar(id: string): Promise<any> {
    const cotizacion = await this.obtener(id);
    this.validarVigenteConItems(cotizacion, ['BORRADOR']);
    await this.cotizacionRepository.update(id, { estado: 'APROBADA' });
    return this.findById(id);
  }

  async rechazar(id: string, motivo: string): Promise<any> {
    const cotizacion = await this.obtener(id);
    if (!['BORRADOR', 'APROBADA'].includes(cotizacion.estado)) {
      throw new ConflictException(`No se puede rechazar una cotización en estado ${cotizacion.estado}`);
    }
    await this.cotizacionRepository.update(id, { estado: 'RECHAZADA', motivoRechazo: motivo });
    return this.findById(id);
  }

  /** Genera un pedido con los items de la cotización y reserva el stock. */
  async convertirAPedido(id: string, dto: ConvertirCotizacionDto, idUsuario?: string): Promise<any> {
    const idPedido = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT 1 FROM cotizaciones WHERE id_cotizacion = $1 FOR UPDATE`, [id]);
      const cotizacion = await this.obtener(id, manager);
      this.validarVigenteConItems(cotizacion, ['BORRADOR', 'APROBADA']);

      const pedidoId = await this.pedidosService.crearEnTransaccion(
        manager,
        {
          idCliente: cotizacion.idCliente,
          idBodega: dto.idBodega,
          idCotizacion: cotizacion.id,
          observacion: `Generado desde la cotización ${cotizacion.numero}`,
          items: cotizacion.detalles.map((d) => ({
            idProducto: d.idProducto,
            cantidad: Number(d.cantidad),
            valorUnitario: Number(d.valorUnitario),
            pctDescuento: Number(d.pctDescuento),
            pctIva: Number(d.pctIva),
          })),
        },
        idUsuario,
      );
      await manager.update(Cotizacion, id, { estado: 'CONVERTIDA' });
      return pedidoId;
    });

    return {
      cotizacion: await this.findById(id),
      pedido: await this.pedidosService.findById(idPedido),
    };
  }

  async generarPdf(id: string) {
    const c = await this.findById(id);
    const t = c.cliente?.tercero;
    const contenido = await this.pdf.documento({
      titulo: 'Cotización',
      numero: c.numero,
      campos: [
        ['Fecha', String(c.fecha).slice(0, 10)],
        ['Válida hasta', c.vigenteHasta ? String(c.vigenteHasta).slice(0, 10) : '—'],
        ['Estado', c.estado],
      ],
      tercero: t
        ? {
            etiqueta: 'Cliente',
            nombre: t.razonSocial,
            documento: t.numeroDocumento,
            telefono: t.telefonos?.[0]?.numero,
            email: t.emails?.[0]?.email,
          }
        : undefined,
      lineas: (c.detalles || []).map((d: any) => ({
        codigo: d.producto?.codigo ?? '',
        descripcion: d.producto?.nombre ?? '',
        cantidad: Number(d.cantidad),
        valorUnitario: Number(d.valorUnitario),
        pctDescuento: Number(d.pctDescuento),
        pctIva: Number(d.pctIva),
        total: d.totalLinea,
      })),
      totales: [
        ['Subtotal', c.subtotal],
        ['Descuentos', -c.totalDescuento],
        ['IVA', c.totalIva],
        ['Total', c.total],
      ],
      notas: [c.observacion].filter(Boolean),
      pie: 'Precios sujetos a disponibilidad de inventario al momento del pedido.',
    });
    return { contenido, nombre: `${c.numero}.pdf`, numero: c.numero as string, cliente: t?.razonSocial as string };
  }

  /** Encola el envío por correo; responde de inmediato con el job (202). */
  async enviarPdf(id: string, destinatario: string | undefined, idUsuario: string) {
    const cotizacion = await this.findById(id);
    if (cotizacion.estado === 'RECHAZADA') {
      throw new ConflictException('No se envía una cotización rechazada');
    }
    if (!cotizacion.detalles?.length) throw new ConflictException('La cotización no tiene productos');

    const emails = cotizacion.cliente?.tercero?.emails || [];
    const email = destinatario || emails.find((e: any) => e.principal)?.email || emails[0]?.email;
    if (!email) {
      throw new UnprocessableEntityException('El cliente no tiene correo registrado. Indique el destinatario en el campo email');
    }
    if (!(await this.correo.disponible())) {
      throw new UnprocessableEntityException('El correo no está configurado. Configure /configuracion/correo y SMTP_PASSWORD');
    }

    const job = await this.jobs.encolar(JOB_ENVIAR_COTIZACION, { idCotizacion: id, email }, idUsuario);
    return {
      jobId: job.id_job,
      estado: job.estado,
      destinatario: email,
      urlEstado: `/api/v1/reportes/jobs/${job.id_job}`,
    };
  }

  private validarVigenteConItems(cotizacion: Cotizacion, estadosPermitidos: string[]) {
    if (!estadosPermitidos.includes(cotizacion.estado)) {
      throw new ConflictException(
        `Operación no permitida para una cotización en estado ${cotizacion.estado}`,
      );
    }
    if (!cotizacion.detalles || cotizacion.detalles.length === 0) {
      throw new ConflictException('La cotización no tiene productos');
    }
    if (cotizacion.vigenteHasta && String(cotizacion.vigenteHasta).slice(0, 10) < fechaHoy()) {
      throw new ConflictException(`La cotización venció el ${cotizacion.vigenteHasta}`);
    }
  }

  private async obtener(id: string, manager: EntityManager = this.dataSource.manager): Promise<Cotizacion> {
    const cotizacion = await manager.findOne(Cotizacion, {
      where: { id },
      relations: { cliente: { tercero: { emails: true, telefonos: true } } },
    });
    if (!cotizacion) throw new NotFoundException(`Cotización con ID ${id} no encontrada`);
    return cotizacion;
  }

  private async guardarItems(manager: EntityManager, idCotizacion: string, items: ItemFacturaVentaDto[]) {
    if (items.length === 0) return;
    const ids = [...new Set(items.map((i) => i.idProducto))];
    const productos = await manager.find(Producto, { where: { id: In(ids) } });
    if (productos.length !== ids.length) {
      throw new NotFoundException('Uno o más productos de la cotización no existen');
    }
    const inactivos = productos.filter((p) => !p.activo);
    if (inactivos.length > 0) {
      throw new BadRequestException(`Productos inactivos: ${inactivos.map((p) => p.codigo).join(', ')}`);
    }

    for (const item of items) {
      await manager.save(
        DetalleCotizacion,
        manager.create(DetalleCotizacion, {
          idCotizacion,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          pctDescuento: item.pctDescuento || 0,
          pctIva: item.pctIva || 0,
        }),
      );
    }
  }

  private conTotales(c: Cotizacion) {
    return {
      ...c,
      detalles: (c.detalles || []).map((d) => ({ ...d, ...calcularLinea(d) })),
      ...calcularTotales(c.detalles || []),
    };
  }
}
