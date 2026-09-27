import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'estados_factura_venta' })
export class EstadoFacturaVenta {
  @PrimaryGeneratedColumn('uuid', { name: 'id_estado' })
  id: string;

  @Column({ name: 'codigo', length: 20, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 50 })
  nombre: string;

  @Column({ name: 'es_final', default: false })
  esFinal: boolean;
}
