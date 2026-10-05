import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { DetalleFacturaVenta } from '../../database/entities/detalle-factura-venta.entity';
import { EstadoFacturaVenta } from '../../database/entities/estado-factura-venta.entity';
import { ResolucionDian } from '../../database/entities/resolucion-dian.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Cotizacion, DetalleCotizacion } from '../../database/entities/cotizacion.entity';
import {
  Pedido,
  DetallePedido,
  HistorialEstadoPedido,
} from '../../database/entities/pedido.entity';
import { FacturasVentaController } from './controllers/facturas-venta.controller';
import {
  CotizacionesController,
  PedidosController,
  ConsecutivosController,
} from './controllers/ventas-documentos.controller';
import { FacturasVentaService } from './facturas-venta.service';
import { CotizacionesService } from './cotizaciones.service';
import { PedidosService } from './pedidos.service';
import { ConsecutivosService } from './consecutivos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacturaVenta,
      DetalleFacturaVenta,
      EstadoFacturaVenta,
      ResolucionDian,
      MovimientoInventario,
      Cotizacion,
      DetalleCotizacion,
      Pedido,
      DetallePedido,
      HistorialEstadoPedido,
    ]),
  ],
  controllers: [
    FacturasVentaController,
    CotizacionesController,
    PedidosController,
    ConsecutivosController,
  ],
  providers: [FacturasVentaService, CotizacionesService, PedidosService, ConsecutivosService],
  exports: [FacturasVentaService, ConsecutivosService],
})
export class VentasModule {}
