import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Pais } from './pais.entity';
import { Ciudad } from './ciudad.entity';

@Entity({ name: 'departamentos' })
export class Departamento {
  @PrimaryGeneratedColumn('uuid', { name: 'id_departamento' })
  id: string;

  @Column({ name: 'id_pais', type: 'uuid' })
  idPais: string;

  @ManyToOne(() => Pais, (pais) => pais.departamentos)
  @JoinColumn({ name: 'id_pais' })
  pais: Pais;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;

  @OneToMany(() => Ciudad, (ciudad) => ciudad.departamento)
  ciudades: Ciudad[];
}
