import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Permission } from './permission.entity';
import { User } from './user.entity';

@Entity({ name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('uuid', { name: 'id_rol' })
  id: string;

  @Column({ name: 'codigo', length: 50, unique: true })
  codigo: string;

  @Column({ name: 'nombre', length: 100 })
  nombre: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'activo', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @ManyToMany(() => Permission, (permiso) => permiso.roles, { eager: true })
  @JoinTable({
    name: 'roles_permisos',
    joinColumn: { name: 'id_rol', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'id_permiso', referencedColumnName: 'id' },
  })
  permisos: Permission[];

  @OneToMany(() => User, (user) => user.rol)
  usuarios: User[];
}
