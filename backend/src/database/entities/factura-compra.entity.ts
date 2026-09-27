import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Proveedor } from './proveedor.entity';
import { Producto } from './producto.entity';

@Entity({ name: 'estados_factura_compra' })
export class EstadoFacturaCompra {
  @PrimaryGeneratedColumn('uuid', { name: 'id_estado' })
  id: string;

  @Column({ name: 'codigo', length: 20, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 50 })
  nombre: string;
}

@Entity({ name: 'facturas_compra' })
export class FacturaCompra {
  @PrimaryGeneratedColumn('uuid', { name: 'id_factura_compra' })
  id: string;

  @Column({ name: 'id_proveedor', type: 'uuid' })
  idProveedor: string;

  @ManyToOne(() => Proveedor, { eager: true })
  @JoinColumn({ name: 'id_proveedor' })
  proveedor: Proveedor;

  @Column({ name: 'id_estado', type: 'uuid' })
  idEstado: string;

  @ManyToOne(() => EstadoFacturaCompra, { eager: true })
  @JoinColumn({ name: 'id_estado' })
  estado: EstadoFacturaCompra;

  @Column({ name: 'numero_factura', length: 30, nullable: true })
  numeroFactura?: string;

  @Column({ name: 'cufe', length: 100, unique: true, nullable: true })
  cufe?: string;

  @Column({ name: 'fecha_emision', type: 'date' })
  fechaEmision: string;

  @Column({ name: 'fecha_vencimiento', type: 'date', nullable: true })
  fechaVencimiento?: string;

  @OneToMany(() => DetalleFacturaCompra, (detalle) => detalle.facturaCompra, {
    cascade: true,
    eager: true,
  })
  detalles: DetalleFacturaCompra[];
}

@Entity({ name: 'detalle_factura_compra' })
export class DetalleFacturaCompra {
  @PrimaryGeneratedColumn('uuid', { name: 'id_detalle' })
  id: string;

  @Column({ name: 'id_factura_compra', type: 'uuid' })
  idFacturaCompra: string;

  @ManyToOne(() => FacturaCompra, (fc) => fc.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_factura_compra' })
  facturaCompra: FacturaCompra;

  @Column({ name: 'id_producto', type: 'uuid', nullable: true })
  idProducto?: string;

  @ManyToOne(() => Producto, { eager: true, nullable: true })
  @JoinColumn({ name: 'id_producto' })
  producto?: Producto;

  @Column({ name: 'cantidad', type: 'numeric', precision: 12, scale: 3 })
  cantidad: number;

  @Column({ name: 'costo_unitario', type: 'numeric', precision: 15, scale: 2 })
  costoUnitario: number;

  @Column({ name: 'pct_iva', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctIva: number;
}
