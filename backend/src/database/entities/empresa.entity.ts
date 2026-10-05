import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Ciudad } from './ciudad.entity';

/** Datos de la empresa emisora. Tabla de una sola fila (id = 1). */
@Entity({ name: 'empresa' })
export class Empresa {
  @PrimaryColumn({ name: 'id', type: 'smallint', default: 1 })
  id: number;

  @Column({ name: 'nit', length: 20 })
  nit: string;

  @Column({ name: 'razon_social', length: 200 })
  razonSocial: string;

  @Column({ name: 'nombre_comercial', length: 200, nullable: true })
  nombreComercial?: string;

  @Column({ name: 'id_ciudad', type: 'uuid', nullable: true })
  idCiudad?: string;

  @ManyToOne(() => Ciudad, { eager: true, nullable: true })
  @JoinColumn({ name: 'id_ciudad' })
  ciudad?: Ciudad;

  @Column({ name: 'direccion', length: 200, nullable: true })
  direccion?: string;

  @Column({ name: 'telefono', length: 30, nullable: true })
  telefono?: string;

  @Column({ name: 'email', length: 150, nullable: true })
  email?: string;

  @Column({ name: 'responsable_iva', default: true })
  responsableIva: boolean;

  @Column({ name: 'responsabilidades_fiscales', length: 100, default: 'R-99-PN' })
  responsabilidadesFiscales: string;

  @Column({ name: 'actividad_economica', length: 10, nullable: true })
  actividadEconomica?: string;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
