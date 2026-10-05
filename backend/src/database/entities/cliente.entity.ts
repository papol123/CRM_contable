import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Tercero } from './tercero.entity';

@Entity({ name: 'clientes' })
export class Cliente {
  @PrimaryGeneratedColumn('uuid', { name: 'id_cliente' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid', unique: true })
  idTercero: string;

  @OneToOne(() => Tercero, (t) => t.cliente, { eager: true, cascade: true })
  @JoinColumn({ name: 'id_tercero' })
  tercero: Tercero;

  @Column({ name: 'cupo_credito', type: 'numeric', precision: 15, scale: 2, default: 0 })
  cupoCredito: number;

  @Column({ name: 'dias_plazo', type: 'int', default: 0 })
  diasPlazo: number;

  /** Impide nuevas ventas a crédito sin perder el cupo configurado (catálogo §25) */
  @Column({ name: 'credito_bloqueado', default: false })
  creditoBloqueado: boolean;

  @Column({ name: 'motivo_bloqueo', type: 'text', nullable: true })
  motivoBloqueo?: string | null;
}
