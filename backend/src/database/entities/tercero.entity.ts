import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TipoDocumento } from './tipo-documento.entity';
import { Ciudad } from './ciudad.entity';
import { Cliente } from './cliente.entity';
import { Proveedor } from './proveedor.entity';
import { Contacto } from './contacto.entity';
import { Telefono } from './telefono.entity';
import { Email } from './email.entity';
import { Direccion } from './direccion.entity';

@Entity({ name: 'terceros' })
export class Tercero {
  @PrimaryGeneratedColumn('uuid', { name: 'id_tercero' })
  id: string;

  @Column({ name: 'id_tipo_documento', type: 'uuid' })
  idTipoDocumento: string;

  @ManyToOne(() => TipoDocumento, { eager: true })
  @JoinColumn({ name: 'id_tipo_documento' })
  tipoDocumento: TipoDocumento;

  @Column({ name: 'numero_documento', length: 30, unique: true })
  numeroDocumento: string;

  @Column({ name: 'razon_social', length: 200 })
  razonSocial: string;

  @Column({ name: 'tipo_persona', length: 20 })
  tipoPersona: 'NATURAL' | 'JURIDICA';

  @Column({ name: 'id_ciudad', type: 'uuid', nullable: true })
  idCiudad?: string;

  @ManyToOne(() => Ciudad, { nullable: true, eager: true })
  @JoinColumn({ name: 'id_ciudad' })
  ciudad?: Ciudad;

  @Column({ name: 'activo', default: true })
  activo: boolean;

  @OneToOne(() => Cliente, (c) => c.tercero)
  cliente?: Cliente;

  @OneToOne(() => Proveedor, (p) => p.tercero)
  proveedor?: Proveedor;

  @OneToMany(() => Contacto, (c) => c.tercero)
  contactos: Contacto[];

  @OneToMany(() => Telefono, (t) => t.tercero)
  telefonos: Telefono[];

  @OneToMany(() => Email, (e) => e.tercero)
  emails: Email[];

  @OneToMany(() => Direccion, (d) => d.tercero)
  direcciones: Direccion[];
}
