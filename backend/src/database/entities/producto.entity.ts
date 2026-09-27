import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { CategoriaProducto } from './categoria-producto.entity';
import { UnidadMedida } from './unidad-medida.entity';
import { Impuesto } from './impuesto.entity';
import { PrecioProducto } from './precio-producto.entity';
import { MovimientoInventario } from './movimiento-inventario.entity';

@Entity({ name: 'productos' })
export class Producto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_producto' })
  id: string;

  @Column({ name: 'codigo', length: 30, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 200 })
  nombre: string;

  @Column({ name: 'id_categoria', type: 'uuid', nullable: true })
  idCategoria?: string;

  @ManyToOne(() => CategoriaProducto, { eager: true })
  @JoinColumn({ name: 'id_categoria' })
  categoria?: CategoriaProducto;

  @Column({ name: 'id_unidad', type: 'uuid', nullable: true })
  idUnidad?: string;

  @ManyToOne(() => UnidadMedida, { eager: true })
  @JoinColumn({ name: 'id_unidad' })
  unidad?: UnidadMedida;

  @Column({ name: 'id_impuesto_venta', type: 'uuid', nullable: true })
  idImpuestoVenta?: string;

  @ManyToOne(() => Impuesto, { eager: true })
  @JoinColumn({ name: 'id_impuesto_venta' })
  impuesto?: Impuesto;

  @Column({ name: 'maneja_inventario', default: true })
  manejaInventario: boolean;

  @Column({ name: 'stock_minimo', type: 'numeric', precision: 12, scale: 3, default: 0 })
  stockMinimo: number;

  @Column({ name: 'activo', default: true })
  activo: boolean;

  @OneToMany(() => PrecioProducto, (p) => p.producto)
  precios: PrecioProducto[];

  @OneToMany(() => MovimientoInventario, (m) => m.producto)
  movimientos: MovimientoInventario[];
}
