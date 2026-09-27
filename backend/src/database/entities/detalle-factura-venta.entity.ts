import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FacturaVenta } from './factura-venta.entity';
import { Producto } from './producto.entity';

@Entity({ name: 'detalle_factura_venta' })
export class DetalleFacturaVenta {
  @PrimaryGeneratedColumn('uuid', { name: 'id_detalle' })
  id: string;

  @Column({ name: 'id_factura_venta', type: 'uuid' })
  idFacturaVenta: string;

  @ManyToOne(() => FacturaVenta, (fv) => fv.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_factura_venta' })
  facturaVenta: FacturaVenta;

  @Column({ name: 'id_producto', type: 'uuid', nullable: true })
  idProducto?: string;

  @ManyToOne(() => Producto, { eager: true, nullable: true })
  @JoinColumn({ name: 'id_producto' })
  producto?: Producto;

  @Column({ name: 'cantidad', type: 'numeric', precision: 12, scale: 3 })
  cantidad: number;

  @Column({ name: 'valor_unitario', type: 'numeric', precision: 15, scale: 2 })
  valorUnitario: number;

  @Column({ name: 'pct_descuento', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctDescuento: number;

  @Column({ name: 'pct_iva', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctIva: number;
}
