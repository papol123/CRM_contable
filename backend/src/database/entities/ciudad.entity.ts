import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Departamento } from './departamento.entity';

@Entity({ name: 'ciudades' })
export class Ciudad {
  @PrimaryGeneratedColumn('uuid', { name: 'id_ciudad' })
  id: string;

  @Column({ name: 'id_departamento', type: 'uuid' })
  idDepartamento: string;

  @ManyToOne(() => Departamento, (dep) => dep.ciudades)
  @JoinColumn({ name: 'id_departamento' })
  departamento: Departamento;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;
}
