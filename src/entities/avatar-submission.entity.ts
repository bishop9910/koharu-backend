// src/entities/avatar-submission.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AvatarStatus } from '../enums/avatar-status.enum.js';

@Entity('avatar_submissions')
export class AvatarSubmission {
  @ApiProperty({ description: '头像投稿唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '提交用户 ID' })
  @Column()
  @Index()
  userId: string;

  @ApiProperty({ description: '头像文件相对路径' })
  @Column()
  path: string;

  @ApiProperty({
    description: '审核状态',
    enum: AvatarStatus,
    default: AvatarStatus.PENDING,
    example: AvatarStatus.PENDING,
  })
  @Column({ type: 'enum', enum: AvatarStatus, default: AvatarStatus.PENDING })
  @Index()
  status: AvatarStatus;

  @ApiProperty({ description: '提交时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '审核状态变更时间' })
  @UpdateDateColumn()
  updatedAt: Date;
}
