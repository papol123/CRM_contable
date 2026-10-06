import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Producto } from './producto.entity';
import { Proveedor } from './proveedor.entity';

@Entity({ name: 'listas_precios' })
export class ListaPrecios {
  @PrimaryGeneratedColumn('uuid', { name: 'id_lista' })
  id: string;

  @Column({ name: 'nombre', length: 100, unique: true })
  nombre: string;
}

@Entity({ name: 'precios_producto' })
export class PrecioProducto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_precio' })
  id: string;

  @Column({ name: 'id_lista', type: 'uuid' })
  idLista: string;

  @ManyToOne(() => ListaPrecios, { eager: true })
  @JoinColumn({ name: 'id_lista' })
  lista: ListaPrecios;

  @Column({ name: 'id_producto', type: 'uuid' })
  idProducto: string;

  @ManyToOne(() => Producto, (prod) => prod.precios)
  @JoinColumn({ name: 'id_producto' })
  producto: Producto;

  @Column({ name: 'precio', type: 'numeric', precision: 15, scale: 2 })
  precio: number;

  @Column({ name: 'vigente_desde', type: 'date' })
  vigenteDesde: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta?: string;
}

@Entity({ name: 'producto_proveedor' })
export class ProductoProveedor {
  @PrimaryGeneratedColumn('uuid', { name: 'id_producto_proveedor' })
  id: string;

  /** (id_producto, id_proveedor) es UNIQUE */
  @Column({ name: 'id_producto', type: 'uuid' })
  idProducto: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'id_producto' })
  producto: Producto;

  @Column({ name: 'id_proveedor', type: 'uuid' })
  idProveedor: string;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'id_proveedor' })
  proveedor: Proveedor;

  @Column({ name: 'codigo_proveedor', length: 50, nullable: true })
  codigoProveedor?: string;

  @Column({ name: 'costo_actual', type: 'numeric', precision: 15, scale: 2, nullable: true })
  costoActual?: number;

  @Column({ name: 'dias_entrega', type: 'int', nullable: true })
  diasEntrega?: number;

  @Column({ name: 'es_principal', default: false })
  esPrincipal: boolean;
}
