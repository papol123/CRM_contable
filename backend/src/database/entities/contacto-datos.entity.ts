import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tercero } from './tercero.entity';

@Entity({ name: 'contactos' })
export class Contacto {
  @PrimaryGeneratedColumn('uuid', { name: 'id_contacto' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid' })
  idTercero: string;

  @ManyToOne(() => Tercero, (t) => t.contactos)
  @JoinColumn({ name: 'id_tercero' })
  tercero: Tercero;

  @Column({ name: 'nombre', length: 150 })
  nombre: string;

  @Column({ name: 'cargo', length: 100, nullable: true })
  cargo?: string;

  @Column({ name: 'principal', default: false })
  principal: boolean;
}

@Entity({ name: 'telefonos' })
export class Telefono {
  @PrimaryGeneratedColumn('uuid', { name: 'id_telefono' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid', nullable: true })
  idTercero?: string;

  @ManyToOne(() => Tercero, (t) => t.telefonos, { nullable: true })
  @JoinColumn({ name: 'id_tercero' })
  tercero?: Tercero;

  @Column({ name: 'id_contacto', type: 'uuid', nullable: true })
  idContacto?: string;

  @Column({ name: 'numero', length: 30 })
  numero: string;

  @Column({ name: 'tipo', length: 20, nullable: true })
  tipo?: string;

  @Column({ name: 'principal', default: false })
  principal: boolean;
}

@Entity({ name: 'emails' })
export class Email {
  @PrimaryGeneratedColumn('uuid', { name: 'id_email' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid', nullable: true })
  idTercero?: string;

  @ManyToOne(() => Tercero, (t) => t.emails, { nullable: true })
  @JoinColumn({ name: 'id_tercero' })
  tercero?: Tercero;

  @Column({ name: 'id_contacto', type: 'uuid', nullable: true })
  idContacto?: string;

  @Column({ name: 'email', length: 150 })
  email: string;

  @Column({ name: 'tipo', length: 20, nullable: true })
  tipo?: string;

  @Column({ name: 'principal', default: false })
  principal: boolean;
}

@Entity({ name: 'direcciones' })
export class Direccion {
  @PrimaryGeneratedColumn('uuid', { name: 'id_direccion' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid' })
  idTercero: string;

  @ManyToOne(() => Tercero, (t) => t.direcciones)
  @JoinColumn({ name: 'id_tercero' })
  tercero: Tercero;

  @Column({ name: 'id_ciudad', type: 'uuid', nullable: true })
  idCiudad?: string;

  @Column({ name: 'direccion', length: 200 })
  direccion: string;

  @Column({ name: 'tipo', length: 20, nullable: true })
  tipo?: string;

  @Column({ name: 'principal', default: false })
  principal: boolean;
}
