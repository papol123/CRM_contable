import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'marcas' })
export class Marca {
  @PrimaryGeneratedColumn('uuid', { name: 'id_marca' })
  id: string;

  @Column({ name: 'nombre', length: 100, unique: true })
  nombre: string;

  @Column({ name: 'pais_origen', length: 100, nullable: true })
  paisOrigen?: string;

  @Column({ name: 'activo', default: true })
  activo: boolean;
}
