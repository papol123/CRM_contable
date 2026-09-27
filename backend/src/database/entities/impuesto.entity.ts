import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'impuestos' })
export class Impuesto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_impuesto' })
  id: string;

  @Column({ name: 'codigo', length: 20 })
  codigo: string;

  @Column({ name: 'porcentaje', type: 'numeric', precision: 5, scale: 2 })
  porcentaje: number;

  @Column({ name: 'tipo', length: 20, nullable: true })
  tipo: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  vigenteDesde: string;
}
