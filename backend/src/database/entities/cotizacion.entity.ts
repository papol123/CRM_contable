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
import { Producto } from './producto.entity';

export type EstadoCotizacion = 'BORRADOR' | 'APROBADA' | 'RECHAZADA' | 'CONVERTIDA';

@Entity({ name: 'cotizaciones' })
export class Cotizacion {
  @PrimaryGeneratedColumn('uuid', { name: 'id_cotizacion' })
  id: string;

  @Column({ name: 'numero', length: 30, unique: true })
  numero: string;

  @Column({ name: 'id_cliente', type: 'uuid' })
  idCliente: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'id_cliente' })
  cliente: Cliente;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'fecha', type: 'date' })
  fecha: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta?: string;

  @Column({ name: 'estado', length: 20, default: 'BORRADOR' })
  estado: EstadoCotizacion;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion?: string;

  @Column({ name: 'motivo_rechazo', type: 'text', nullable: true })
  motivoRechazo?: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => DetalleCotizacion, (d) => d.cotizacion, { cascade: true, eager: true })
  detalles: DetalleCotizacion[];
}

@Entity({ name: 'detalle_cotizacion' })
export class DetalleCotizacion {
  @PrimaryGeneratedColumn('uuid', { name: 'id_detalle' })
  id: string;

  @Column({ name: 'id_cotizacion', type: 'uuid' })
  idCotizacion: string;

  @ManyToOne(() => Cotizacion, (c) => c.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_cotizacion' })
  cotizacion: Cotizacion;

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
