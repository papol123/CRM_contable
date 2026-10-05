import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InventarioService } from '../inventario.service';
import { RequirePermission } from '../../auth/decorators/permissions.decorator';
import { Actor } from '../../auth/decorators/actor.decorator';
import { Auditar } from '../../auditoria/auditar';
import { AnularDocumentoDto } from '../../ventas/dto/factura-venta.dto';
import {
  RegistrarMovimientoDto,
  AjusteFisicoDto,
  EntradaInventarioDto,
  SalidaInventarioDto,
  TrasladoInventarioDto,
  DevolucionInventarioDto,
  CrearConteoDto,
  CerrarConteoDto,
  ConsultaSaldosDto,
  ConsultaMovimientosDto,
  ConsultaKardexDto,
  ConsultaSinMovimientoDto,
} from '../dto/movimiento-inventario.dto';

const PERMISO_COSTOS = 'inventario.costos';

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Saldos actuales por producto y bodega (saldo, reservado y disponible)' })
  async getSaldos(@Query() filtros: ConsultaSaldosDto) {
    return this.inventarioService.consultarSaldos(filtros);
  }

  @Get('movimientos')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Movimientos de inventario (paginado, filtra por producto, bodega y fechas)' })
  async getMovimientos(@Query() filtros: ConsultaMovimientosDto) {
    return this.inventarioService.getMovimientos(filtros);
  }

  @Get('alertas-stock')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Productos con saldo por debajo o igual al stock mínimo' })
  async getAlertasStock() {
    return this.inventarioService.getAlertasStock();
  }

  @Get('sin-movimiento')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Productos con existencias y sin movimiento en los últimos N días' })
  async getSinMovimiento(@Query() q: ConsultaSinMovimientoDto) {
    return this.inventarioService.getSinMovimiento(q.dias ?? 180);
  }

  @Get('valorizado')
  @RequirePermission(PERMISO_COSTOS)
  @ApiOperation({ summary: 'Inventario valorizado a costo promedio ponderado' })
  async getInventarioValorizado() {
    return this.inventarioService.getInventarioValorizado();
  }

  @Post('movimientos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.ajustar')
  @Auditar({ accion: 'MOVIMIENTO_MANUAL', recurso: 'movimientos_inventario', registrarCuerpo: true })
  @ApiOperation({ summary: 'Movimiento manual genérico (administrativo), incluidos ajustes directos' })
  async registrarMovimiento(@Body() dto: RegistrarMovimientoDto, @Actor() actor: Actor) {
    return this.inventarioService.registrarMovimiento(dto, actor);
  }

  @Post('ajustes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Ajuste por conteo físico con motivo (auditado)' })
  @ApiResponse({ status: 422, description: 'Sin diferencia, periodo cerrado o producto sin inventario' })
  async ajusteFisico(@Body() dto: AjusteFisicoDto, @Actor() actor: Actor) {
    return this.inventarioService.ajusteFisico(dto, actor);
  }

  @Post('movimientos/:id/reversar')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Reversar un movimiento manual con motivo (genera movimiento compensatorio)' })
  @ApiResponse({ status: 409, description: 'Ya reversado, generado por un documento o sin stock para reversar' })
  async reversarMovimiento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularDocumentoDto,
    @Actor() actor: Actor,
  ) {
    return this.inventarioService.reversarMovimiento(id, dto.motivo, actor);
  }

  @Post('entradas')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.movimientos')
  @ApiOperation({ summary: 'Registrar entrada de inventario (movimiento + saldo)' })
  async registrarEntrada(@Body() dto: EntradaInventarioDto, @Actor() actor: Actor) {
    return this.inventarioService.registrarEntrada(dto, actor);
  }

  @Post('salidas')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.movimientos')
  @ApiOperation({ summary: 'Registrar salida (rechaza si no hay stock disponible)' })
  @ApiResponse({ status: 409, description: 'Stock insuficiente' })
  async registrarSalida(@Body() dto: SalidaInventarioDto, @Actor() actor: Actor) {
    return this.inventarioService.registrarSalida(dto, actor);
  }

  @Post('traslados')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.movimientos')
  @ApiOperation({ summary: 'Traslado entre bodegas: salida y entrada en la misma transacción' })
  @ApiResponse({ status: 409, description: 'Stock insuficiente en la bodega de origen' })
  async registrarTraslado(@Body() dto: TrasladoInventarioDto, @Actor() actor: Actor) {
    return this.inventarioService.registrarTraslado(dto, actor);
  }

  @Post('devoluciones')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.movimientos')
  @ApiOperation({ summary: 'Registrar devolución de mercancía a la bodega' })
  async registrarDevolucion(@Body() dto: DevolucionInventarioDto, @Actor() actor: Actor) {
    return this.inventarioService.registrarDevolucion(dto, actor);
  }

  @Post('conteos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Abrir conteo cíclico de una bodega (uno abierto por bodega)' })
  async crearConteo(@Body() dto: CrearConteoDto, @Actor() actor: Actor) {
    return this.inventarioService.crearConteo(dto, actor);
  }

  @Get('conteos/:id')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Detalle del conteo' })
  async getConteo(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventarioService.getConteo(id);
  }

  @Post('conteos/:id/cerrar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventario.ajustar')
  @ApiOperation({ summary: 'Cerrar conteo y generar ajustes (un conteo cerrado no se vuelve a cerrar)' })
  @ApiResponse({ status: 409, description: 'El conteo ya está cerrado' })
  async cerrarConteo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarConteoDto, @Actor() actor: Actor) {
    return this.inventarioService.cerrarConteo(id, dto, actor);
  }

  @Get(':productoId')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Saldo del producto en todas las bodegas' })
  async getSaldoPorProducto(@Param('productoId', ParseUUIDPipe) productoId: string) {
    return this.inventarioService.getSaldoPorProducto(productoId);
  }

  @Get(':productoId/kardex')
  @RequirePermission('inventario.consultar')
  @ApiOperation({ summary: 'Kardex completo con saldo acumulado (costos solo con inventario.costos)' })
  async getKardexProducto(
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Query() q: ConsultaKardexDto,
    @Actor() actor: Actor,
  ) {
    return this.inventarioService.getKardexProducto(productoId, {
      bodegaId: q.bodegaId,
      verCostos: actor.permisos.includes(PERMISO_COSTOS),
    });
  }
}
