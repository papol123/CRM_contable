import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Departamento } from './departamento.entity';

@Entity({ name: 'paises' })
export class Pais {
  @PrimaryGeneratedColumn('uuid', { name: 'id_pais' })
  id: string;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;

  @OneToMany(() => Departamento, (departamento) => departamento.pais)
  departamentos: Departamento[];
}
