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
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import {
  ComprasController,
  CarteraController,
} from './controllers/compras-cartera.controller';
import {
  PagosController,
  GastosController,
  ReportesController,
} from './controllers/pagos-gastos-reportes.controller';
import { FinancieroService } from './financiero.service';

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
      FacturaVenta,
      MovimientoInventario,
      Bodega,
    ]),
  ],
  controllers: [
    ComprasController,
    CarteraController,
    PagosController,
    GastosController,
    ReportesController,
  ],
  providers: [FinancieroService],
  exports: [FinancieroService],
})
export class FinancieroModule {}
