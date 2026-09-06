// src/entities/avatar.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity.js';

@Entity('avatars')
export class Avatar {
  @ApiProperty({ description: '头像唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ 
    description: '头像文件的相对路径', 
    example: '/uploads/avatars/550e8400-e29b-41d4-a716-446655440000.jpg' 
  })
  @Column()
  path: string;

  @ApiProperty({ description: '关联的用户 ID' })
  @Column({ unique: true })
  userId: string;

  @ApiPropertyOptional({ 
    description: '关联的用户详细信息', 
    type: () => User
  })
  @OneToOne(() => User, (user) => user.avatar, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty({ description: '头像创建时间' })
  @CreateDateColumn()
  createdAt: Date;
}