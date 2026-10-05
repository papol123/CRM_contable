import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Tercero } from './tercero.entity';

@Entity({ name: 'proveedores' })
export class Proveedor {
  @PrimaryGeneratedColumn('uuid', { name: 'id_proveedor' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid', unique: true })
  idTercero: string;

  @OneToOne(() => Tercero, (t) => t.proveedor, { eager: true, cascade: true })
  @JoinColumn({ name: 'id_tercero' })
  tercero: Tercero;

  @Column({ name: 'dias_plazo', type: 'int', default: 0 })
  diasPlazo: number;
}
