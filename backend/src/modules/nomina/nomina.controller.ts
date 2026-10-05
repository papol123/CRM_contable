import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiProduces } from '@nestjs/swagger';
import { NominaService } from './nomina.service';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { Actor } from '../auth/decorators/actor.decorator';
import { archivo } from '../../common/archivos/respuesta-archivo';
import {
  AbrirPeriodoNominaDto,
  CalcularNominaDto,
  ConsultaEmpleadosDto,
  CreateEmpleadoDto,
  PagarNominaDto,
  UpdateEmpleadoDto,
} from './nomina.dto';

@ApiTags('Empleados y Nómina')
@ApiBearerAuth()
@Controller()
export class NominaController {
  constructor(private readonly nominaService: NominaService) {}

  // ─── Empleados ─────────────────────────────────────────────────────────────

  @Get('empleados')
  @RequirePermission('empleados.consultar')
  @ApiOperation({ summary: 'Listar empleados (paginado; busca por nombre, documento o cargo)' })
  async getEmpleados(@Query() filtros: ConsultaEmpleadosDto) {
    return this.nominaService.findAllEmpleados(filtros);
  }

  @Get('empleados/:id')
  @RequirePermission('empleados.consultar')
  @ApiOperation({ summary: 'Detalle de un empleado' })
  async getEmpleado(@Param('id', ParseUUIDPipe) id: string) {
    return this.nominaService.findEmpleadoById(id);
  }

  @Post('empleados')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('empleados.gestionar')
  @ApiOperation({ summary: 'Registrar empleado (con un tercero existente o creando uno nuevo)' })
  async createEmpleado(@Body() dto: CreateEmpleadoDto, @Actor() actor: Actor) {
    return this.nominaService.createEmpleado(dto, actor);
  }

  @Patch('empleados/:id')
  @RequirePermission('empleados.gestionar')
  @ApiOperation({ summary: 'Actualizar cargo, salario, contrato o estado' })
  async updateEmpleado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmpleadoDto, @Actor() actor: Actor) {
    return this.nominaService.updateEmpleado(id, dto, actor);
  }

  // ─── Nómina ────────────────────────────────────────────────────────────────

  @Get('nomina')
  @RequirePermission('nomina.consultar')
  @ApiOperation({ summary: 'Periodos de nómina' })
  async getPeriodosNomina() {
    return this.nominaService.findAllPeriodosNomina();
  }

  @Get('nomina/:id')
  @RequirePermission('nomina.consultar')
  @ApiOperation({ summary: 'Detalle del periodo con la liquidación de cada empleado' })
  async getPeriodoNomina(@Param('id', ParseUUIDPipe) id: string) {
    return this.nominaService.findPeriodoNominaById(id);
  }

  @Post('nomina')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('nomina.gestionar')
  @ApiOperation({ summary: 'Abrir el periodo del mes con los empleados activos y liquidarlo' })
  @ApiResponse({ status: 409, description: 'Ya existe la nómina de ese mes' })
  async abrirPeriodo(@Body() dto: AbrirPeriodoNominaDto, @Actor() actor: Actor) {
    return this.nominaService.abrirPeriodo(dto, actor);
  }

  @Post('nomina/:id/calcular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('nomina.gestionar')
  @ApiOperation({ summary: 'Aplicar novedades y calcular devengados, deducciones y neto' })
  async calcularNomina(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CalcularNominaDto, @Actor() actor: Actor) {
    return this.nominaService.calcularNomina(id, dto, actor);
  }

  @Post('nomina/:id/pagar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('nomina.gestionar')
  @ApiOperation({ summary: 'Marcar la nómina como pagada y generar el gasto (transaccional)' })
  @ApiResponse({ status: 409, description: 'Ya pagada o sin calcular' })
  async pagarNomina(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PagarNominaDto, @Actor() actor: Actor) {
    return this.nominaService.pagarNomina(id, dto, actor);
  }

  @Get('nomina/:id/desprendibles')
  @RequirePermission('nomina.consultar')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Desprendibles de pago en PDF (una página por empleado)' })
  async getDesprendibles(@Param('id', ParseUUIDPipe) id: string) {
    const { contenido, nombre } = await this.nominaService.getDesprendibles(id);
    return archivo(contenido, nombre, 'application/pdf');
  }
}
