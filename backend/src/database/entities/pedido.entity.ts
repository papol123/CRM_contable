import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Cliente } from './cliente.entity';
import { Bodega } from './bodega.entity';
import { Producto } from './producto.entity';

export type EstadoPedido =
  | 'RECIBIDO'
  | 'EN_PROCESO'
  | 'ENVIADO'
  | 'ENTREGADO'
  | 'FACTURADO'
  | 'ANULADO';

@Entity({ name: 'pedidos' })
export class Pedido {
  @PrimaryGeneratedColumn('uuid', { name: 'id_pedido' })
  id: string;

  @Column({ name: 'numero', length: 30, unique: true })
  numero: string;

  @Column({ name: 'id_cliente', type: 'uuid' })
  idCliente: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'id_cliente' })
  cliente: Cliente;

  @Column({ name: 'id_cotizacion', type: 'uuid', nullable: true })
  idCotizacion?: string;

  @Column({ name: 'id_bodega', type: 'uuid' })
  idBodega: string;

  @ManyToOne(() => Bodega, { eager: true })
  @JoinColumn({ name: 'id_bodega' })
  bodega: Bodega;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'id_factura_venta', type: 'uuid', nullable: true })
  idFacturaVenta?: string;

  @Column({ name: 'fecha', type: 'date' })
  fecha: string;

  @Column({ name: 'estado', length: 20, default: 'RECIBIDO' })
  estado: EstadoPedido;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion?: string;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => DetallePedido, (d) => d.pedido, { cascade: true, eager: true })
  detalles: DetallePedido[];

  @OneToMany(() => HistorialEstadoPedido, (h) => h.pedido)
  historial: HistorialEstadoPedido[];
}

@Entity({ name: 'detalle_pedido' })
export class DetallePedido {
  @PrimaryGeneratedColumn('uuid', { name: 'id_detalle' })
  id: string;

  @Column({ name: 'id_pedido', type: 'uuid' })
  idPedido: string;

  @ManyToOne(() => Pedido, (p) => p.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_pedido' })
  pedido: Pedido;

  @Column({ name: 'id_producto', type: 'uuid' })
  idProducto: string;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'id_producto' })
  producto: Producto;

  @Column({ name: 'cantidad', type: 'numeric', precision: 12, scale: 3 })
  cantidad: number;

  @Column({ name: 'valor_unitario', type: 'numeric', precision: 15, scale: 2 })
  valorUnitario: number;

  @Column({ name: 'pct_descuento', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctDescuento: number;

  @Column({ name: 'pct_iva', type: 'numeric', precision: 5, scale: 2, default: 0 })
  pctIva: number;
}

@Entity({ name: 'historial_estados_pedido' })
export class HistorialEstadoPedido {
  @PrimaryGeneratedColumn('uuid', { name: 'id_historial' })
  id: string;

  @Column({ name: 'id_pedido', type: 'uuid' })
  idPedido: string;

  @ManyToOne(() => Pedido, (p) => p.historial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_pedido' })
  pedido: Pedido;

  @Column({ name: 'estado', length: 20 })
  estado: string;

  @CreateDateColumn({ name: 'fecha', type: 'timestamptz' })
  fecha: Date;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion?: string;
}
