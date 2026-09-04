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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../enums/role.enum.js';
import { type Avatar } from './avatar.entity.js';

@Entity('users')
export class User {
  @ApiProperty({ description: '用户唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户名', example: 'koharu_user' })
  @Column({ length: 50, unique: true })
  @Index()
  username: string;

  @ApiProperty({ description: '电子邮箱', example: 'user@example.com' })
  @Column({ length: 100, unique: true })
  @Index()
  email: string;

  @ApiProperty({ description: '密码 (仅用于写入，响应中已脱敏)' })
  @Column()
  password: string;

  @ApiProperty({ enum: Role, description: '用户角色', default: Role.USER })
  @Column({ 
    type: 'enum', 
    enum: Role, 
    default: Role.USER 
  })
  role: Role;

  @ApiPropertyOptional({ description: '个人简介', maxLength: 500 })
  @Column({ nullable: true, length: 500 })
  bio: string;

  @ApiProperty({ description: '邮箱是否已验证' })
  @Column({ default: true })
  emailVerified: boolean;

  @ApiPropertyOptional({ description: '关联的头像信息' })
  @OneToOne('Avatar', (avatar: Avatar) => avatar.user, {
    cascade: true, 
    eager: false, 
  })
  avatar: Avatar;

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiPropertyOptional({ description: '软删除时间' })
  @DeleteDateColumn()
  deletedAt: Date;
}