// src/entities/image.entity.ts
import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn
} from 'typeorm';
import { User } from './user.entity.js';
import { ImageStatus } from '../enums/image-status.enum.js';

@Entity('images')
export class Image {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  filename: string;

  @Column()
  path: string;

  @Column({ nullable: true })
  thumbnailPath: string;

  @Column()
  mimeType: string;

  @Column()
  size: number;

  @Column({ nullable: true })
  width: number;

  @Column({ nullable: true })
  height: number;

  @Column({ nullable: true })
  userId: string;

  @Column()
  md5: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: ImageStatus, default: ImageStatus.PENDING })
  @Index()
  status: ImageStatus;

  @Column({ nullable: true, length: 255 })
  rejectReason: string;

  @Column({ nullable: true })
  reviewedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}