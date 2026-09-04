// src/entities/user.entity.ts
import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToOne
} from 'typeorm';
import { Role } from '../enums/role.enum.js';
import { type Avatar } from './avatar.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true })
  @Index()
  username: string;

  @Column({ length: 100, unique: true })
  @Index()
  email: string;

  @Column()
  password: string;

  @Column({ 
    type: 'enum', 
    enum: Role, 
    default: Role.USER 
  })
  role: Role;

  @Column({ nullable: true, length: 500 })
  bio: string;

  @Column({ default: true })
  emailVerified: boolean;

  @OneToOne('Avatar', (avatar: Avatar) => avatar.user, {
    cascade: true, 
    eager: false, 
  })
  avatar: Avatar;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}