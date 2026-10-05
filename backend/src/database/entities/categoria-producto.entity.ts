import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'categorias_producto' })
export class CategoriaProducto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_categoria' })
  id: string;

  @Column({ name: 'id_categoria_padre', type: 'uuid', nullable: true })
  idCategoriaPadre?: string;

  @ManyToOne(() => CategoriaProducto, (cat) => cat.subcategorias, { nullable: true })
  @JoinColumn({ name: 'id_categoria_padre' })
  categoriaPadre?: CategoriaProducto;

  @OneToMany(() => CategoriaProducto, (cat) => cat.categoriaPadre)
  subcategorias: CategoriaProducto[];

  @Column({ name: 'nombre', length: 100 })
  nombre: string;
}
