import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FacturaCompra,
  DetalleFacturaCompra,
  EstadoFacturaCompra,
} from '../../database/entities/factura-compra.entity';
import {
  Pago,
  EstadoPago,
  AplicacionPagoVenta,
  AplicacionPagoCompra,
  Gasto,
} from '../../database/entities/pagos-gastos.entity';
import { CategoriaGasto } from '../../database/entities/categoria-gasto.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { ComprasController, CarteraController } from './controllers/compras-cartera.controller';
import {
  PagosController,
  GastosController,
  ReportesController,
} from './controllers/pagos-gastos-reportes.controller';
import { ComprasService } from './compras.service';
import { CarteraService } from './cartera.service';
import { PagosService } from './pagos.service';
import { GastosService } from './gastos.service';
import { ReportesService } from './reportes.service';
import { InventarioModule } from '../inventario/inventario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacturaCompra,
      DetalleFacturaCompra,
      EstadoFacturaCompra,
      Pago,
      EstadoPago,
      AplicacionPagoVenta,
      AplicacionPagoCompra,
      Gasto,
      CategoriaGasto,
      MovimientoInventario,
    ]),
    InventarioModule,
  ],
  controllers: [
    ComprasController,
    CarteraController,
    PagosController,
    GastosController,
    ReportesController,
  ],
  providers: [ComprasService, CarteraService, PagosService, GastosService, ReportesService],
  exports: [CarteraService],
})
export class FinancieroModule {}
