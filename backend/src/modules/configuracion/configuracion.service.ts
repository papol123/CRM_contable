import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../auth/decorators/actor.decorator';
import { AlmacenamientoService, TIPOS_IMAGEN_PERMITIDOS } from '../../common/almacenamiento/almacenamiento.service';
import { ArchivoSubido, validarArchivo } from '../../common/archivos/adjuntos.service';
import { CorreoService } from '../../common/correo/correo.service';
import { AlertasDto, CorreoDto, EmpresaDto } from './configuracion.dto';

/** Claves que no se editan con PATCH /configuracion: tienen su propio endpoint o son internas. */
const CLAVES_RESERVADAS = /^(EMPRESA_|CORREO_|ALERTAS_|DASHBOARD_CONFIG_USER_)/;
const CLAVES_SECRETAS = /(PASSWORD|SECRET|TOKEN|KEY|CLAVE)/i;

@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly correo: CorreoService,
    private readonly config: ConfigService,
  ) {}

  private async leerCategoria(prefijo: string, db: EntityManager = this.dataSource.manager) {
    const filas: Array<{ clave: string; valor: string }> = await db.query(
      `SELECT clave, valor FROM configuracion_sistema WHERE clave LIKE $1`,
      [`${prefijo}%`],
    );
    return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  }

  private async guardar(db: EntityManager, clave: string, valor: string, categoria: string) {
    await db.query(
      `INSERT INTO configuracion_sistema (clave, valor, categoria, actualizado_en)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = CURRENT_TIMESTAMP`,
      [clave, valor, categoria],
    );
  }

  // ─── Parámetros generales ──────────────────────────────────────────────────

  async getParametros() {
    const filas = await this.dataSource.query(
      `SELECT clave, valor, descripcion, categoria, actualizado_en AS "actualizadoEn"
         FROM configuracion_sistema
        WHERE clave NOT LIKE 'DASHBOARD_CONFIG_USER_%'
        ORDER BY categoria, clave`,
    );
    return {
      parametros: Object.fromEntries(filas.map((f: any) => [f.clave, f.valor])),
      detalles: filas,
    };
  }

  /**
   * Actualiza parámetros existentes (p. ej. NOMINA_SMMLV). No crea claves
   * nuevas ni toca las que tienen endpoint propio o parecen secretos.
   */
  async updateParametros(parametros: Record<string, unknown>, actor: Actor) {
    const entradas = Object.entries(parametros || {});
    if (!entradas.length) throw new UnprocessableEntityException('Envíe al menos un parámetro');

    return this.dataSource.transaction(async (manager) => {
      const anteriores: Record<string, string> = {};
      for (const [clave, valor] of entradas) {
        if (CLAVES_RESERVADAS.test(clave) || CLAVES_SECRETAS.test(clave)) {
          throw new ForbiddenException(`El parámetro ${clave} no se modifica por esta vía`);
        }
        if (valor === null || valor === undefined || (typeof valor === 'object' && !Array.isArray(valor))) {
          throw new UnprocessableEntityException(`Valor inválido para ${clave}`);
        }
        const texto = Array.isArray(valor) ? JSON.stringify(valor) : String(valor);
        if (texto.length > 2000) throw new UnprocessableEntityException(`El valor de ${clave} es demasiado largo`);

        const [actual] = await manager.query(`SELECT valor FROM configuracion_sistema WHERE clave = $1 FOR UPDATE`, [clave]);
        if (!actual) throw new NotFoundException(`El parámetro ${clave} no existe`);
        anteriores[clave] = actual.valor;
        await manager.query(
          `UPDATE configuracion_sistema SET valor = $2, actualizado_en = CURRENT_TIMESTAMP WHERE clave = $1`,
          [clave, texto],
        );
      }
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ACTUALIZAR_PARAMETROS',
          recurso: 'configuracion_sistema',
          valorAnterior: anteriores,
          valorNuevo: parametros,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return this.getParametros();
    });
  }

  // ─── Empresa ───────────────────────────────────────────────────────────────

  async getDatosEmpresa() {
    const [empresa] = await this.dataSource.query(
      `SELECT e.nit, e.razon_social AS "razonSocial", e.nombre_comercial AS "nombreComercial",
              e.id_ciudad AS "idCiudad", c.nombre AS ciudad, e.direccion, e.telefono, e.email,
              e.responsable_iva AS "responsableIva", e.actualizado_en AS "actualizadoEn"
         FROM empresa e LEFT JOIN ciudades c ON c.id_ciudad = e.id_ciudad
        ORDER BY e.fila LIMIT 1`,
    );
    const { EMPRESA_LOGO_RUTA: logo } = await this.leerCategoria('EMPRESA_LOGO_RUTA');
    return {
      ...(empresa || {}),
      tieneLogo: !!logo,
      urlLogo: logo ? '/api/v1/configuracion/empresa/logo' : null,
    };
  }

  async updateDatosEmpresa(dto: EmpresaDto, actor: Actor) {
    return this.dataSource.transaction(async (manager) => {
      const [anterior] = await manager.query(`SELECT * FROM empresa ORDER BY fila LIMIT 1 FOR UPDATE`);
      if (!anterior && (!dto.nit || !dto.razonSocial)) {
        throw new UnprocessableEntityException('Para registrar la empresa envíe al menos NIT y razón social');
      }
      const valores = {
        nit: dto.nit ?? anterior?.nit,
        razon_social: dto.razonSocial ?? anterior?.razon_social,
        nombre_comercial: dto.nombreComercial ?? anterior?.nombre_comercial ?? null,
        id_ciudad: dto.idCiudad ?? anterior?.id_ciudad ?? null,
        direccion: dto.direccion ?? anterior?.direccion ?? null,
        telefono: dto.telefono ?? anterior?.telefono ?? null,
        email: dto.email ?? anterior?.email ?? null,
        responsable_iva: dto.responsableIva ?? anterior?.responsable_iva ?? true,
      };
      await manager.query(
        `INSERT INTO empresa (fila, nit, razon_social, nombre_comercial, id_ciudad, direccion, telefono, email, responsable_iva, actualizado_en)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (fila) DO UPDATE SET
           nit = EXCLUDED.nit, razon_social = EXCLUDED.razon_social, nombre_comercial = EXCLUDED.nombre_comercial,
           id_ciudad = EXCLUDED.id_ciudad, direccion = EXCLUDED.direccion, telefono = EXCLUDED.telefono,
           email = EXCLUDED.email, responsable_iva = EXCLUDED.responsable_iva, actualizado_en = now()`,
        [valores.nit, valores.razon_social, valores.nombre_comercial, valores.id_ciudad, valores.direccion, valores.telefono, valores.email, valores.responsable_iva],
      );
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ACTUALIZAR_EMPRESA',
          recurso: 'empresa',
          valorAnterior: anterior || null,
          valorNuevo: valores,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
      return valores;
    }).then(() => this.getDatosEmpresa());
  }

  /** Sube el logo (PNG, JPG o WEBP, máx. 10 MB) al almacenamiento; reemplaza el anterior. */
  async updateLogoEmpresa(archivo: ArchivoSubido, actor: Actor) {
    validarArchivo(archivo, TIPOS_IMAGEN_PERMITIDOS);
    const extension = archivo.mimetype === 'image/png' ? '.png' : archivo.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const ruta = this.almacenamiento.generarRuta('empresa/logo', extension);
    await this.almacenamiento.guardar(ruta, archivo.buffer, archivo.mimetype);

    const { EMPRESA_LOGO_RUTA: anterior } = await this.leerCategoria('EMPRESA_LOGO_RUTA');
    await this.guardar(this.dataSource.manager, 'EMPRESA_LOGO_RUTA', ruta, 'EMPRESA');
    if (anterior) await this.almacenamiento.eliminar(anterior);

    await this.auditoria.registrar({
      idUsuario: actor.id,
      accion: 'ACTUALIZAR_LOGO',
      recurso: 'empresa',
      valorNuevo: { nombreArchivo: archivo.originalname, tamanoBytes: archivo.size },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { mensaje: 'Logo actualizado', urlLogo: '/api/v1/configuracion/empresa/logo' };
  }

  async getLogoEmpresa() {
    const { EMPRESA_LOGO_RUTA: ruta } = await this.leerCategoria('EMPRESA_LOGO_RUTA');
    if (!ruta) throw new NotFoundException('La empresa no tiene logo');
    const extension = ruta.split('.').pop();
    return {
      contenido: await this.almacenamiento.leer(ruta),
      tipoMime: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg',
      nombre: `logo.${extension}`,
    };
  }

  // ─── Alertas ───────────────────────────────────────────────────────────────

  async getReglasAlertas() {
    const map = await this.leerCategoria('ALERTAS_');
    return {
      stockMinimoActivo: map.ALERTAS_STOCK_MINIMO !== 'false',
      diasMoraCartera: Number(map.ALERTAS_DIAS_MORA_CARTERA) || 30,
      umbralStockCritico: Number(map.ALERTAS_UMBRAL_STOCK_CRITICO) || 5,
    };
  }

  async updateReglasAlertas(dto: AlertasDto, actor: Actor) {
    const anterior = await this.getReglasAlertas();
    await this.dataSource.transaction(async (manager) => {
      if (dto.stockMinimoActivo !== undefined) await this.guardar(manager, 'ALERTAS_STOCK_MINIMO', String(dto.stockMinimoActivo), 'ALERTAS');
      if (dto.diasMoraCartera !== undefined) await this.guardar(manager, 'ALERTAS_DIAS_MORA_CARTERA', String(dto.diasMoraCartera), 'ALERTAS');
      if (dto.umbralStockCritico !== undefined) await this.guardar(manager, 'ALERTAS_UMBRAL_STOCK_CRITICO', String(dto.umbralStockCritico), 'ALERTAS');
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ACTUALIZAR_ALERTAS',
          recurso: 'configuracion_sistema',
          valorAnterior: anterior,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.getReglasAlertas();
  }

  // ─── Correo ────────────────────────────────────────────────────────────────

  /** Nunca devuelve la contraseña: solo si está configurada en el entorno. */
  async getConfiguracionCorreo() {
    const c = await this.correo.configuracion();
    return {
      ...c,
      passwordConfigurada: !!this.config.get('SMTP_PASSWORD'),
      disponible: await this.correo.disponible(),
    };
  }

  async updateConfiguracionCorreo(dto: CorreoDto, actor: Actor) {
    const anterior = await this.correo.configuracion();
    const mapping: Record<string, unknown> = {
      CORREO_HOST: dto.host,
      CORREO_PUERTO: dto.puerto,
      CORREO_REMITENTE: dto.remitente,
      CORREO_USUARIO: dto.usuario,
      CORREO_SSL: dto.ssl,
    };
    await this.dataSource.transaction(async (manager) => {
      for (const [clave, valor] of Object.entries(mapping)) {
        if (valor !== undefined) await this.guardar(manager, clave, String(valor), 'CORREO');
      }
      await this.auditoria.registrar(
        {
          idUsuario: actor.id,
          accion: 'ACTUALIZAR_CORREO',
          recurso: 'configuracion_sistema',
          valorAnterior: anterior,
          valorNuevo: dto,
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        manager,
      );
    });
    return this.getConfiguracionCorreo();
  }
}
