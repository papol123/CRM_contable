import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { Empresa } from '../../database/entities/empresa.entity';
import { redondear } from '../../common/documentos/totales';
import { calcularCufe } from './ubl/cufe';
import { codigoTipoDocumento, separarNit } from './ubl/identificacion';
import { DocumentoElectronico, ImpuestoDocumento, generarXmlUbl } from './ubl/xml-ubl';
import { PROVEEDOR_FACTURACION, ProveedorFacturacion } from './proveedores/proveedor-facturacion';

/**
 * Facturación electrónica OPCIONAL. Con FACTURACION_ELECTRONICA=false (por
 * defecto) el resto del sistema funciona igual: aquí solo se puede generar
 * la vista previa del XML UBL; el envío responde 409.
 */
@Injectable()
export class FacturacionElectronicaService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(FacturaVenta)
    private readonly facturaRepository: Repository<FacturaVenta>,
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    @Inject(PROVEEDOR_FACTURACION)
    private readonly proveedor: ProveedorFacturacion,
  ) {}

  get habilitada(): boolean {
    return this.config.get<string>('FACTURACION_ELECTRONICA') === 'true';
  }

  private get tipoAmbiente(): '1' | '2' {
    return this.config.get<string>('DIAN_AMBIENTE') === '1' ? '1' : '2';
  }

  /** Qué falta para poder emitir. Útil para una pantalla de configuración. */
  async estadoConfiguracion() {
    const empresa = await this.empresaRepository.findOne({ where: { fila: 1 } });
    const [resolucion] = await this.facturaRepository.manager.query(
      `SELECT numero_resolucion, clave_tecnica FROM resoluciones_dian
        WHERE vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE
        ORDER BY fecha_expedicion DESC LIMIT 1`,
    );

    const faltantes: string[] = [];
    if (!this.habilitada) faltantes.push('Activar FACTURACION_ELECTRONICA=true en el .env');
    if (this.proveedor.nombre === 'ninguno') faltantes.push('Configurar un proveedor (FACTURACION_PROVEEDOR)');
    if (!empresa) faltantes.push('Registrar los datos de la empresa (PUT /empresa)');
    if (!resolucion) faltantes.push('Registrar una resolución de numeración vigente');
    else if (!resolucion.clave_tecnica) faltantes.push('Registrar la clave técnica de la resolución (necesaria para el CUFE)');

    return {
      habilitada: this.habilitada,
      proveedor: this.proveedor.nombre,
      ambiente: this.tipoAmbiente === '1' ? 'PRODUCCION' : 'PRUEBAS',
      empresaConfigurada: !!empresa,
      resolucionVigente: resolucion?.numero_resolucion ?? null,
      claveTecnicaRegistrada: !!resolucion?.clave_tecnica,
      listaParaEmitir: faltantes.length === 0,
      faltantes,
    };
  }

  /** Arma el documento electrónico a partir de una factura de venta existente. */
  async construirDocumento(idFactura: string): Promise<{ documento: DocumentoElectronico; advertencias: string[] }> {
    const factura = await this.facturaRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.cliente', 'c')
      .innerJoinAndSelect('c.tercero', 't')
      .leftJoinAndSelect('t.tipoDocumento', 'td')
      .leftJoinAndSelect('t.ciudad', 'ci')
      .leftJoinAndSelect('ci.departamento', 'dep')
      .leftJoinAndSelect('t.emails', 'em')
      .leftJoinAndSelect('t.telefonos', 'tel')
      .leftJoinAndSelect('t.direcciones', 'dir')
      .leftJoinAndSelect('f.resolucion', 'r')
      .leftJoinAndSelect('f.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .where('f.id = :id', { id: idFactura })
      .getOne();
    if (!factura) throw new NotFoundException(`Factura de venta con ID ${idFactura} no encontrada`);

    const empresa = await this.empresaRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.ciudad', 'ci')
      .leftJoinAndSelect('ci.departamento', 'dep')
      .where('e.id = 1')
      .getOne();
    if (!empresa) {
      throw new ConflictException('Faltan los datos de la empresa emisora. Regístrelos con PUT /empresa');
    }

    const advertencias: string[] = [];

    // Líneas e impuestos agrupados por tarifa
    const porTarifa = new Map<number, ImpuestoDocumento>();
    const lineas = factura.detalles.map((d, i) => {
      const bruto = Number(d.cantidad) * Number(d.valorUnitario);
      const descuento = redondear(bruto * (Number(d.pctDescuento || 0) / 100));
      const base = redondear(bruto - descuento);
      const pctIva = Number(d.pctIva || 0);
      const valorIva = redondear(base * (pctIva / 100));

      const tarifa = porTarifa.get(pctIva) ?? { porcentaje: pctIva, base: 0, valor: 0 };
      tarifa.base = redondear(tarifa.base + base);
      tarifa.valor = redondear(tarifa.valor + valorIva);
      porTarifa.set(pctIva, tarifa);

      return {
        numero: i + 1,
        codigo: d.producto?.codigo ?? 'SIN-CODIGO',
        descripcion: d.producto?.nombre ?? 'Producto',
        cantidad: Number(d.cantidad),
        valorUnitario: Number(d.valorUnitario),
        descuento,
        baseGravable: base,
        pctIva,
        valorIva,
      };
    });

    const impuestos = [...porTarifa.values()];
    const valorBruto = redondear(lineas.reduce((acc, l) => acc + l.baseGravable, 0));
    const totalImpuestos = redondear(impuestos.reduce((acc, i) => acc + i.valor, 0));
    const totalConImpuestos = redondear(valorBruto + totalImpuestos);

    const tercero = factura.cliente.tercero;
    const idCliente = separarNit(tercero.numeroDocumento);
    const idEmisor = separarNit(empresa.nit);
    if (!tercero.emails?.length) advertencias.push('El cliente no tiene correo: la DIAN exige enviarle la factura');

    // El número electrónico es prefijo + consecutivo, sin separadores
    const prefijo = factura.resolucion?.prefijo || factura.numeroVenta.split('-')[0];
    const consecutivo = factura.numeroVenta.match(/(\d+)$/)?.[1] ?? '0';
    const numero = `${prefijo}${Number(consecutivo)}`;

    const creado = factura.creadoEn ? new Date(factura.creadoEn) : new Date();
    const horaEmision = `${new Intl.DateTimeFormat('en-GB', {
      timeZone: process.env.APP_TIMEZONE || 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(creado)}-05:00`;
    const fechaEmision = String(factura.fechaExpedicion).slice(0, 10);
    const fechaVencimiento = String(factura.fechaVencimiento ?? factura.fechaExpedicion).slice(0, 10);

    const claveTecnica = factura.resolucion?.claveTecnica;
    let cufe: string | null = null;
    if (!factura.resolucion) {
      advertencias.push('La factura no tiene resolución de numeración: no se puede calcular el CUFE');
    } else if (!claveTecnica) {
      advertencias.push('La resolución no tiene clave técnica: el CUFE queda vacío');
    } else {
      cufe = calcularCufe({
        numeroFactura: numero,
        fechaEmision,
        horaEmision,
        valorBruto,
        valorIva: totalImpuestos,
        valorInc: 0,
        valorIca: 0,
        valorTotal: totalConImpuestos,
        nitEmisor: idEmisor.numero,
        documentoAdquiriente: idCliente.numero,
        claveTecnica,
        tipoAmbiente: this.tipoAmbiente,
      });
    }

    const documento: DocumentoElectronico = {
      numero,
      prefijo,
      fechaEmision,
      horaEmision,
      fechaVencimiento,
      formaPago: fechaVencimiento > fechaEmision ? 'CREDITO' : 'CONTADO',
      tipoAmbiente: this.tipoAmbiente,
      resolucion: factura.resolucion
        ? {
            numero: factura.resolucion.numeroResolucion,
            fechaExpedicion: String(factura.resolucion.fechaExpedicion).slice(0, 10),
            vigenteHasta: factura.resolucion.vigenteHasta
              ? String(factura.resolucion.vigenteHasta).slice(0, 10)
              : undefined,
            rangoDesde: Number(factura.resolucion.rangoDesde),
            rangoHasta: Number(factura.resolucion.rangoHasta),
          }
        : undefined,
      emisor: {
        tipoDocumento: '31',
        numeroDocumento: idEmisor.numero,
        dv: idEmisor.dv,
        razonSocial: empresa.razonSocial,
        tipoPersona: 'JURIDICA',
        responsabilidadesFiscales: empresa.responsabilidadesFiscales,
        responsableIva: empresa.responsableIva,
        direccion: empresa.direccion,
        ciudad: empresa.ciudad?.nombre,
        departamento: empresa.ciudad?.departamento?.nombre,
        telefono: empresa.telefono,
        email: empresa.email,
      },
      adquiriente: {
        tipoDocumento: codigoTipoDocumento(tercero.tipoDocumento?.codigo),
        numeroDocumento: idCliente.numero,
        dv: idCliente.dv,
        razonSocial: tercero.razonSocial,
        tipoPersona: tercero.tipoPersona,
        responsabilidadesFiscales: tercero.responsabilidadesFiscales || 'R-99-PN',
        responsableIva: tercero.tipoPersona === 'JURIDICA',
        direccion: tercero.direcciones?.find((d) => d.principal)?.direccion ?? tercero.direcciones?.[0]?.direccion,
        ciudad: tercero.ciudad?.nombre,
        departamento: tercero.ciudad?.departamento?.nombre,
        telefono: tercero.telefonos?.[0]?.numero,
        email: tercero.emails?.find((e) => e.principal)?.email ?? tercero.emails?.[0]?.email,
      },
      lineas,
      impuestos,
      totales: {
        valorBruto,
        totalImpuestos,
        totalConImpuestos,
        retefuente: Number(factura.retefuente || 0),
      },
      cufe,
      observaciones: factura.observaciones,
    };

    return { documento, advertencias };
  }

  async generarXml(idFactura: string) {
    const { documento, advertencias } = await this.construirDocumento(idFactura);
    return {
      numero: documento.numero,
      cufe: documento.cufe,
      advertencias,
      xml: generarXmlUbl(documento),
    };
  }

  /** Envía la factura por el proveedor configurado y guarda el resultado. */
  async enviar(idFactura: string) {
    if (!this.habilitada) {
      throw new ConflictException(
        'La facturación electrónica está deshabilitada (FACTURACION_ELECTRONICA=false). ' +
          'Consulte GET /facturacion-electronica/estado para ver los requisitos',
      );
    }

    const factura = await this.facturaRepository.findOne({ where: { id: idFactura } });
    if (!factura) throw new NotFoundException(`Factura de venta con ID ${idFactura} no encontrada`);
    if (factura.anulada) throw new ConflictException('No se envía a la DIAN una factura anulada');
    if (factura.estadoDian === 'ACEPTADA' || factura.estadoDian === 'ENVIADA') {
      throw new ConflictException(`La factura ya fue enviada (estado ${factura.estadoDian})`);
    }

    const { documento, advertencias } = await this.construirDocumento(idFactura);
    if (!documento.cufe) {
      throw new ConflictException(`No se puede enviar: ${advertencias.join('; ')}`);
    }

    const resultado = await this.proveedor.enviar(documento, generarXmlUbl(documento));

    await this.facturaRepository.update(idFactura, {
      estadoDian: resultado.estado,
      cufe: resultado.cufe ?? documento.cufe,
      fechaEnvioDian: new Date(),
      respuestaDian: JSON.stringify({ mensaje: resultado.mensaje, respuesta: resultado.respuesta ?? null }),
    });

    return {
      idFactura,
      numero: documento.numero,
      estadoDian: resultado.estado,
      cufe: resultado.cufe ?? documento.cufe,
      mensaje: resultado.mensaje,
      advertencias,
    };
  }
}
