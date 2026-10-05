import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'unidades_medida' })
export class UnidadMedida {
  @PrimaryGeneratedColumn('uuid', { name: 'id_unidad' })
  id: string;

  @Column({ name: 'codigo', length: 10, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 50 })
  nombre: string;

  @Column({ name: 'decimales', type: 'int', default: 0 })
  decimales: number;
}
