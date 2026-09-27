import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { DetalleFacturaVenta } from '../../database/entities/detalle-factura-venta.entity';
import { EstadoFacturaVenta } from '../../database/entities/estado-factura-venta.entity';
import { ResolucionDian } from '../../database/entities/resolucion-dian.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import { FacturasVentaController } from './controllers/facturas-venta.controller';
import {
  CotizacionesController,
  PedidosController,
  ResolucionesController,
} from './controllers/ventas-documentos.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacturaVenta,
      DetalleFacturaVenta,
      EstadoFacturaVenta,
      ResolucionDian,
      MovimientoInventario,
      Bodega,
    ]),
  ],
  controllers: [
    FacturasVentaController,
    CotizacionesController,
    PedidosController,
    ResolucionesController,
  ],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
