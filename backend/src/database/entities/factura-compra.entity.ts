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

  @Column({ name: 'id_bodega', type: 'uuid', nullable: true })
  idBodega?: string;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;

  /** Retenciones practicadas al proveedor (valores en pesos calculados al registrar) */
  @Column({ name: 'retefuente', type: 'numeric', precision: 15, scale: 2, default: 0 })
  retefuente: number;

  @Column({ name: 'reteiva', type: 'numeric', precision: 15, scale: 2, default: 0 })
  reteiva: number;

  @Column({ name: 'reteica', type: 'numeric', precision: 15, scale: 2, default: 0 })
  reteica: number;

  /** Tarifas aplicadas al registrar (GEMINI §4.2: porcentajes NUMERIC(5,2)) */
  @Column({ name: 'pct_retefuente', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctRetefuente: number;

  @Column({ name: 'pct_reteiva', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctReteIva: number;

  /** ReteICA por mil (‰) */
  @Column({ name: 'tarifa_reteica', type: 'numeric', precision: 5, scale: 2, default: 0 })
  tarifaReteIca: number;

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

  @Column({ name: 'pct_descuento', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctDescuento: number;
}
