import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Producto } from './producto.entity';
import { Bodega } from './bodega.entity';

@Entity({ name: 'movimientos_inventario' })
export class MovimientoInventario {
  @PrimaryGeneratedColumn('uuid', { name: 'id_movimiento' })
  id: string;

  @Column({ name: 'id_producto', type: 'uuid' })
  idProducto: string;

  @ManyToOne(() => Producto, (prod) => prod.movimientos, { eager: true })
  @JoinColumn({ name: 'id_producto' })
  producto: Producto;

  @Column({ name: 'id_bodega', type: 'uuid' })
  idBodega: string;

  @ManyToOne(() => Bodega, { eager: true })
  @JoinColumn({ name: 'id_bodega' })
  bodega: Bodega;

  @Column({ name: 'tipo_movimiento', length: 20 })
  tipoMovimiento: string; // 'ENTRADA', 'SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'TRASLADO'

  @Column({ name: 'cantidad', type: 'numeric', precision: 12, scale: 3 })
  cantidad: number;

  @Column({ name: 'costo_unitario', type: 'numeric', precision: 15, scale: 2, nullable: true })
  costoUnitario?: number;

  @CreateDateColumn({ name: 'fecha', type: 'timestamptz' })
  fecha: Date;

  @Column({ name: 'origen_tabla', length: 50, nullable: true })
  origenTabla?: string;

  @Column({ name: 'origen_id', type: 'uuid', nullable: true })
  origenId?: string;

  /** Quién registró el movimiento y por qué (obligatorio en ajustes) */
  @Column({ name: 'id_usuario', type: 'uuid', nullable: true })
  idUsuario?: string;

  @Column({ name: 'motivo', type: 'text', nullable: true })
  motivo?: string;
}
