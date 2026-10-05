import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { RefreshToken } from './refresh-token.entity';

@Entity({ name: 'usuarios' })
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'id_usuario' })
  id: string;

  @Column({ name: 'id_tercero', type: 'uuid', nullable: true })
  idTercero: string;

  @Column({ name: 'id_rol', type: 'uuid' })
  idRol: string;

  @ManyToOne(() => Role, (role) => role.usuarios, { eager: true })
  @JoinColumn({ name: 'id_rol' })
  rol: Role;

  @Column({ name: 'email', length: 150, unique: true })
  email: string;

  @Column({ name: 'password_hash', length: 255, select: false })
  passwordHash: string;

  @Column({ name: 'nombres', length: 100 })
  nombres: string;

  @Column({ name: 'apellidos', length: 100 })
  apellidos: string;

  @Column({ name: 'telefono', length: 30, nullable: true })
  telefono: string;

  @Column({ name: 'activo', default: true })
  activo: boolean;

  @Column({ name: 'ultimo_login', type: 'timestamptz', nullable: true })
  ultimoLogin: Date;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;

  @OneToMany(() => RefreshToken, (token) => token.usuario)
  refreshTokens: RefreshToken[];
}
