import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Cliente } from './cliente.entity';
import { ResolucionDian } from './resolucion-dian.entity';
import { EstadoFacturaVenta } from './estado-factura-venta.entity';
import { DetalleFacturaVenta } from './detalle-factura-venta.entity';

@Entity({ name: 'facturas_venta' })
export class FacturaVenta {
  @PrimaryGeneratedColumn('uuid', { name: 'id_factura_venta' })
  id: string;

  @Column({ name: 'id_cliente', type: 'uuid' })
  idCliente: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'id_cliente' })
  cliente: Cliente;

  @Column({ name: 'id_resolucion', type: 'uuid', nullable: true })
  idResolucion?: string;

  @ManyToOne(() => ResolucionDian, (r) => r.facturas, { nullable: true, eager: true })
  @JoinColumn({ name: 'id_resolucion' })
  resolucion?: ResolucionDian;

  @Column({ name: 'id_estado', type: 'uuid' })
  idEstado: string;

  @ManyToOne(() => EstadoFacturaVenta, { eager: true })
  @JoinColumn({ name: 'id_estado' })
  estado: EstadoFacturaVenta;

  @Column({ name: 'numero_venta', length: 30, unique: true })
  numeroVenta: string;

  @Column({ name: 'fecha_expedicion', type: 'date' })
  fechaExpedicion: string;

  @Column({ name: 'fecha_vencimiento', type: 'date', nullable: true })
  fechaVencimiento?: string;

  @Column({ name: 'retefuente', type: 'numeric', precision: 15, scale: 2, default: 0 })
  retefuente: number;

  @Column({ name: 'anulada', default: false })
  anulada: boolean;

  @OneToMany(() => DetalleFacturaVenta, (detalle) => detalle.facturaVenta, {
    cascade: true,
    eager: true,
  })
  detalles: DetalleFacturaVenta[];
}
