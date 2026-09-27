import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'categorias_gasto' })
export class CategoriaGasto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_categoria_gasto' })
  id: string;

  @Column({ name: 'nombre', length: 100, unique: true })
  nombre: string;

  @Column({ name: 'codigo_puc', length: 20, nullable: true })
  codigoPuc?: string;
}
