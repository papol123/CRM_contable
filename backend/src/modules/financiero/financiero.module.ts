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
import { GastosService } from './gastos.service';
import { ReportesService } from './reportes.service';
import { InventarioModule } from '../inventario/inventario.module';
import { PagosModule } from './pagos.module';

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
    PagosModule,
  ],
  controllers: [
    ComprasController,
    CarteraController,
    PagosController,
    GastosController,
    ReportesController,
  ],
  providers: [ComprasService, CarteraService, GastosService, ReportesService],
  exports: [CarteraService, GastosService, ComprasService, PagosModule],
})
export class FinancieroModule {}
