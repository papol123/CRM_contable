import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Producto } from '../../database/entities/producto.entity';
import {
  ListaPrecios,
  PrecioProducto,
  ProductoProveedor,
} from '../../database/entities/precio-proveedor.entity';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import { ProductosController } from './controllers/productos.controller';
import { InventarioController } from './controllers/inventario.controller';
import { ProductosService } from './productos.service';
import { InventarioService } from './inventario.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Producto,
      ListaPrecios,
      PrecioProducto,
      ProductoProveedor,
      MovimientoInventario,
      Bodega,
    ]),
  ],
  controllers: [ProductosController, InventarioController],
  providers: [ProductosService, InventarioService],
  exports: [ProductosService, InventarioService],
})
export class InventarioModule {}
