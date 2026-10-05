import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Role } from './role.entity';

@Entity({ name: 'permisos' })
export class Permission {
  @PrimaryGeneratedColumn('uuid', { name: 'id_permiso' })
  id: string;

  @Column({ name: 'modulo', length: 50 })
  modulo: string;

  @Column({ name: 'codigo', length: 100, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @ManyToMany(() => Role, (role) => role.permisos)
  roles: Role[];
}
