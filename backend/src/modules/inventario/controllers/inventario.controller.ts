import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventarioService } from '../inventario.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { RegistrarMovimientoDto, AjusteFisicoDto } from '../dto/movimiento-inventario.dto';

@ApiTags('Inventario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Consultar saldos de inventario por producto y bodega' })
  @ApiQuery({ name: 'bodegaId', required: false })
  async getSaldos(@Query('bodegaId') bodegaId?: string) {
    return this.inventarioService.getSaldos(bodegaId);
  }

  @Get('movimientos')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Kardex de movimientos de inventario' })
  @ApiQuery({ name: 'productoId', required: false })
  @ApiQuery({ name: 'bodegaId', required: false })
  @ApiQuery({ name: 'fechaDesde', required: false })
  @ApiQuery({ name: 'fechaHasta', required: false })
  async getMovimientos(
    @Query('productoId') productoId?: string,
    @Query('bodegaId') bodegaId?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.inventarioService.getMovimientos(productoId, bodegaId, fechaDesde, fechaHasta);
  }

  @Get('alertas-stock')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Productos con saldo por debajo o igual al stock mínimo' })
  async getAlertasStock() {
    return this.inventarioService.getAlertasStock();
  }

  @Get('sin-movimiento')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Inventario obsoleto o sin movimiento por X días' })
  @ApiQuery({ name: 'dias', required: false, example: 180 })
  async getSinMovimiento(@Query('dias') dias?: number) {
    return this.inventarioService.getSinMovimiento(dias ? Number(dias) : 180);
  }

  @Get('valorizado')
  @RequirePermission('inventario.costos')
  @ApiOperation({ summary: 'Inventario valorizado a costo (solo Administrador)' })
  async getInventarioValorizado() {
    return this.inventarioService.getInventarioValorizado();
  }

  @Post('movimientos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Registrar entrada o salida manual de inventario' })
  async registrarMovimiento(@Body() dto: RegistrarMovimientoDto) {
    return this.inventarioService.registrarMovimiento(dto);
  }

  @Post('ajustes')
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Ajuste de inventario por conteo físico (solo Administrador)' })
  async ajusteFisico(@Body() dto: AjusteFisicoDto) {
    return this.inventarioService.ajusteFisico(dto);
  }

  @Post('movimientos/:id/reversar')
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Reversar movimiento de inventario (genera movimiento compensatorio)' })
  async reversarMovimiento(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.inventarioService.reversarMovimiento(id);
  }
}
