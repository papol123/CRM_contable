import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { FacturaVenta } from './factura-venta.entity';

@Entity({ name: 'resoluciones_dian' })
export class ResolucionDian {
  @PrimaryGeneratedColumn('uuid', { name: 'id_resolucion' })
  id: string;

  @Column({ name: 'prefijo', length: 10, nullable: true })
  prefijo?: string;

  @Column({ name: 'numero_resolucion', length: 30 })
  numeroResolucion: string;

  @Column({ name: 'fecha_expedicion', type: 'date' })
  fechaExpedicion: string;

  @Column({ name: 'rango_desde', type: 'bigint' })
  rangoDesde: number;

  @Column({ name: 'rango_hasta', type: 'bigint' })
  rangoHasta: number;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta?: string;

  @OneToMany(() => FacturaVenta, (factura) => factura.resolucion)
  facturas: FacturaVenta[];
}
