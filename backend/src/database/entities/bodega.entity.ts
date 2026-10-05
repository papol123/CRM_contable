import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Ciudad } from './ciudad.entity';

@Entity({ name: 'bodegas' })
export class Bodega {
  @PrimaryGeneratedColumn('uuid', { name: 'id_bodega' })
  id: string;

  @Column({ name: 'codigo', length: 20, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;

  @Column({ name: 'id_ciudad', type: 'uuid', nullable: true })
  idCiudad?: string;

  @ManyToOne(() => Ciudad, { nullable: true, eager: true })
  @JoinColumn({ name: 'id_ciudad' })
  ciudad?: Ciudad;

  @Column({ name: 'activo', default: true })
  activo: boolean;
}
