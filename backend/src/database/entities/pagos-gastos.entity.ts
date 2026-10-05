import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tercero } from './tercero.entity';
import { MetodoPago } from './metodo-pago.entity';
import { FacturaVenta } from './factura-venta.entity';
import { FacturaCompra } from './factura-compra.entity';
import { CategoriaGasto } from './categoria-gasto.entity';

@Entity({ name: 'estados_pago' })
export class EstadoPago {
  @PrimaryGeneratedColumn('uuid', { name: 'id_estado' })
  id: string;

  @Column({ name: 'codigo', length: 20, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 50 })
  nombre: string;
}

@Entity({ name: 'pagos' })
export class Pago {
  @PrimaryGeneratedColumn('uuid', { name: 'id_pago' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid' })
  idTercero: string;

  @ManyToOne(() => Tercero, { eager: true })
  @JoinColumn({ name: 'id_tercero' })
  tercero: Tercero;

  @Column({ name: 'id_metodo_pago', type: 'uuid' })
  idMetodoPago: string;

  @ManyToOne(() => MetodoPago, { eager: true })
  @JoinColumn({ name: 'id_metodo_pago' })
  metodoPago: MetodoPago;

  @Column({ name: 'id_estado', type: 'uuid' })
  idEstado: string;

  @ManyToOne(() => EstadoPago, { eager: true })
  @JoinColumn({ name: 'id_estado' })
  estado: EstadoPago;

  @Column({ name: 'tipo_pago', length: 20 })
  tipoPago: 'factura de venta' | 'factura de compra';

  @Column({ name: 'fecha_pago', type: 'date' })
  fechaPago: string;

  @Column({ name: 'monto', type: 'numeric', precision: 15, scale: 2 })
  monto: number;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'observaciones', type: 'text', nullable: true })
  observaciones?: string;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;
}

@Entity({ name: 'aplicacion_pago_venta' })
export class AplicacionPagoVenta {
  @PrimaryGeneratedColumn('uuid', { name: 'id_aplicacion' })
  id: string;

  @Column({ name: 'id_pago', type: 'uuid' })
  idPago: string;

  @ManyToOne(() => Pago)
  @JoinColumn({ name: 'id_pago' })
  pago: Pago;

  @Column({ name: 'id_factura_venta', type: 'uuid' })
  idFacturaVenta: string;

  @ManyToOne(() => FacturaVenta)
  @JoinColumn({ name: 'id_factura_venta' })
  facturaVenta: FacturaVenta;

  @Column({ name: 'monto_aplicado', type: 'numeric', precision: 15, scale: 2 })
  montoAplicado: number;
}

@Entity({ name: 'aplicacion_pago_compra' })
export class AplicacionPagoCompra {
  @PrimaryGeneratedColumn('uuid', { name: 'id_aplicacion' })
  id: string;

  @Column({ name: 'id_pago', type: 'uuid' })
  idPago: string;

  @ManyToOne(() => Pago)
  @JoinColumn({ name: 'id_pago' })
  pago: Pago;

  @Column({ name: 'id_factura_compra', type: 'uuid' })
  idFacturaCompra: string;

  @ManyToOne(() => FacturaCompra)
  @JoinColumn({ name: 'id_factura_compra' })
  facturaCompra: FacturaCompra;

  @Column({ name: 'monto_aplicado', type: 'numeric', precision: 15, scale: 2 })
  montoAplicado: number;
}

@Entity({ name: 'gastos' })
export class Gasto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_gasto' })
  id: string;

  @Column({ name: 'id_categoria_gasto', type: 'uuid' })
  idCategoriaGasto: string;

  @ManyToOne(() => CategoriaGasto, { eager: true })
  @JoinColumn({ name: 'id_categoria_gasto' })
  categoria: CategoriaGasto;

  @Column({ name: 'id_metodo_pago', type: 'uuid', nullable: true })
  idMetodoPago?: string;

  @ManyToOne(() => MetodoPago, { eager: true, nullable: true })
  @JoinColumn({ name: 'id_metodo_pago' })
  metodoPago?: MetodoPago;

  @Column({ name: 'descripcion', length: 200 })
  descripcion: string;

  @Column({ name: 'monto', type: 'numeric', precision: 15, scale: 2 })
  monto: number;

  @Column({ name: 'fecha', type: 'date' })
  fecha: string;

  @Column({ name: 'soporte_url', type: 'text', nullable: true })
  soporteUrl?: string;

  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'anulado', default: false })
  anulado: boolean;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;
}
