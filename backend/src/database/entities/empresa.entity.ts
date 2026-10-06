import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Ciudad } from './ciudad.entity';

/** Datos de la empresa emisora. Tabla de una sola fila (fila = 1, UNIQUE). */
@Entity({ name: 'empresa' })
export class Empresa {
  @PrimaryGeneratedColumn('uuid', { name: 'id_empresa' })
  id: string;

  /** Siempre 1: garantiza que exista una sola fila */
  @Column({ name: 'fila', type: 'smallint', default: 1 })
  fila: number;

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
