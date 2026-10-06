import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Empresa } from '../../database/entities/empresa.entity';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { GuardarEmpresaDto } from './dto/empresa.dto';

@ApiTags('Facturación electrónica (opcional)')
@ApiBearerAuth()
@Controller()
export class FacturacionElectronicaController {
  constructor(
    private readonly servicio: FacturacionElectronicaService,
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
  ) {}

  @Get('facturacion-electronica/estado')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Estado de la configuración y requisitos pendientes para emitir' })
  async estado() {
    return this.servicio.estadoConfiguracion();
  }

  @Get('facturas-venta/:id/xml-ubl')
  @RequirePermission('ventas.consultar')
  @ApiOperation({
    summary: 'Vista previa del XML UBL 2.1 (sin firma) y CUFE de la factura',
    description: 'No envía nada a la DIAN. Funciona aunque la facturación electrónica esté deshabilitada.',
  })
  async xml(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.generarXml(id);
  }

  @Post('facturas-venta/:id/enviar-dian')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ventas.crear')
  @ApiOperation({ summary: 'Enviar la factura a la DIAN por el proveedor configurado' })
  @ApiResponse({ status: 409, description: 'Facturación electrónica deshabilitada, factura anulada o ya enviada' })
  @ApiResponse({ status: 501, description: 'No hay proveedor configurado' })
  async enviar(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.enviar(id);
  }

  @Get('empresa')
  @RequirePermission('ventas.consultar')
  @ApiOperation({ summary: 'Datos de la empresa emisora' })
  async getEmpresa() {
    const empresa = await this.empresaRepository.findOne({ where: { fila: 1 } });
    if (!empresa) throw new NotFoundException('Los datos de la empresa no se han registrado');
    return empresa;
  }

  @Put('empresa')
  @RequirePermission('configuracion.gestionar')
  @ApiOperation({ summary: 'Registrar o actualizar los datos de la empresa emisora' })
  async guardarEmpresa(@Body() dto: GuardarEmpresaDto) {
    await this.empresaRepository.save(this.empresaRepository.create({ ...dto, fila: 1 }));
    return this.empresaRepository.findOne({ where: { fila: 1 } });
  }
}
