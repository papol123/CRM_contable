import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'tipos_documento' })
export class TipoDocumento {
  @PrimaryGeneratedColumn('uuid', { name: 'id_tipo_documento' })
  id: string;

  @Column({ name: 'codigo', length: 10, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;
}
