import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'metodos_pago' })
export class MetodoPago {
  @PrimaryGeneratedColumn('uuid', { name: 'id_metodo_pago' })
  id: string;

  @Column({ name: 'codigo', length: 20, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 50 })
  nombre: string;

  @Column({ name: 'afecta_caja', default: true })
  afectaCaja: boolean;
}
