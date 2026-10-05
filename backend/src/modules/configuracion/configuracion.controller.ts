import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfiguracionService } from './configuracion.service';
import { Autenticado, RequirePermission } from '../auth/decorators/permissions.decorator';
import { Actor } from '../auth/decorators/actor.decorator';
import { AlertasDto, CorreoDto, EmpresaDto } from './configuracion.dto';
import { ArchivoSubido } from '../../common/archivos/adjuntos.service';
import { TAMANO_MAXIMO_ADJUNTO } from '../../common/almacenamiento/almacenamiento.service';
import { archivo } from '../../common/archivos/respuesta-archivo';

@ApiTags('Configuración del Sistema')
@ApiBearerAuth()
@RequirePermission('configuracion.gestionar')
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  @Get()
  @ApiOperation({ summary: 'Parámetros generales del sistema' })
  async getParametros() {
    return this.configuracionService.getParametros();
  }

  @Patch()
  @ApiOperation({
    summary: 'Actualizar parámetros existentes (p. ej. NOMINA_SMMLV)',
    description: 'Cuerpo: objeto clave → valor. No crea claves ni modifica empresa, correo, alertas o secretos.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] } } })
  async updateParametros(@Body() body: Record<string, unknown>, @Actor() actor: Actor) {
    return this.configuracionService.updateParametros(body, actor);
  }

  @Get('empresa')
  @Autenticado()
  @ApiOperation({ summary: 'Datos de la empresa (los usan los PDF de remisiones, cotizaciones y recibos)' })
  async getEmpresa() {
    return this.configuracionService.getDatosEmpresa();
  }

  @Patch('empresa')
  @ApiOperation({ summary: 'Actualizar datos de la empresa' })
  async updateEmpresa(@Body() dto: EmpresaDto, @Actor() actor: Actor) {
    return this.configuracionService.updateDatosEmpresa(dto, actor);
  }

  @Post('empresa/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ADJUNTO, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] } })
  @ApiOperation({ summary: 'Subir el logo institucional (PNG, JPG o WEBP)' })
  async uploadLogo(@UploadedFile() logo: ArchivoSubido, @Actor() actor: Actor) {
    return this.configuracionService.updateLogoEmpresa(logo, actor);
  }

  @Get('empresa/logo')
  @Autenticado()
  @ApiOperation({ summary: 'Descargar el logo de la empresa' })
  async getLogo() {
    const { contenido, tipoMime, nombre } = await this.configuracionService.getLogoEmpresa();
    return archivo(contenido, nombre, tipoMime);
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Reglas de alertas (stock mínimo, días de mora)' })
  async getAlertas() {
    return this.configuracionService.getReglasAlertas();
  }

  @Patch('alertas')
  @ApiOperation({ summary: 'Actualizar reglas de alertas' })
  async updateAlertas(@Body() dto: AlertasDto, @Actor() actor: Actor) {
    return this.configuracionService.updateReglasAlertas(dto, actor);
  }

  @Get('correo')
  @ApiOperation({ summary: 'Configuración del servidor de correo (nunca devuelve la contraseña)' })
  async getCorreo() {
    return this.configuracionService.getConfiguracionCorreo();
  }

  @Patch('correo')
  @ApiOperation({
    summary: 'Actualizar servidor de correo',
    description: 'La contraseña SMTP se define en la variable SMTP_PASSWORD (Secret Manager), no en esta API.',
  })
  async updateCorreo(@Body() dto: CorreoDto, @Actor() actor: Actor) {
    return this.configuracionService.updateConfiguracionCorreo(dto, actor);
  }
}
