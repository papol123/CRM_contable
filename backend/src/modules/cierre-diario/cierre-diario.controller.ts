import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Actor } from '../auth/decorators/actor.decorator';
import { CierreDiarioService } from './cierre-diario.service';
import {
  ConsultaCierresDiariosDto,
  FechaCierreParamDto,
  FechaCierreQueryDto,
  GuardarCierreDiarioDto,
} from './dto/cierre-diario.dto';

@ApiTags('Cierre diario')
@ApiBearerAuth()
@Controller('cierres-diarios')
export class CierreDiarioController {
  constructor(private readonly cierreDiarioService: CierreDiarioService) {}

  @Get()
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({ summary: 'Historial de cierres diarios (más reciente primero)' })
  async listar(@Query() filtros: ConsultaCierresDiariosDto) {
    return this.cierreDiarioService.listar(filtros);
  }

  @Get('resumen')
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({
    summary: 'Ventas, gastos y compras del día de todos los usuarios, con el cierre guardado y su cuadre',
  })
  async resumen(@Query() q: FechaCierreQueryDto, @Actor() actor: Actor) {
    return this.cierreDiarioService.resumen(q.fecha, actor);
  }

  @Put(':fecha')
  @RequirePermission('cierres.ejecutar')
  @ApiOperation({
    summary: 'Guardar (o reemplazar) el cierre del día',
    description: 'Los totales y el saldo esperado se recalculan en el servidor. Queda en la bitácora de auditoría.',
  })
  @ApiResponse({ status: 422, description: 'Fecha futura o periodo contable cerrado' })
  async guardar(@Param() p: FechaCierreParamDto, @Body() dto: GuardarCierreDiarioDto, @Actor() actor: Actor) {
    return this.cierreDiarioService.guardar(p.fecha, dto, actor);
  }
}
