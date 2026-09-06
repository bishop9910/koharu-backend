// src/entities/image.entity.ts
import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, ManyToMany, JoinColumn
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity.js';
import { Album } from './album.entity.js';
import { ImageStatus } from '../enums/image-status.enum.js';

@Entity('images')
export class Image {
  @ApiProperty({ description: '图片唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '原始文件名', example: 'vacation_photo.jpg' })
  @Column()
  filename: string;

  @ApiProperty({ description: '原图相对路径', example: '/images/550e8400-e29b-41d4-a716-446655440000.jpg' })
  @Column()
  path: string;

  @ApiPropertyOptional({ description: '缩略图相对路径', example: '/image_cache/thumb_550e8400-e29b-41d4-a716-446655440000.jpg' })
  @Column({ nullable: true })
  thumbnailPath: string;

  @ApiProperty({ description: 'MIME 类型', example: 'image/jpeg' })
  @Column()
  mimeType: string;

  @ApiProperty({ description: '文件大小 (字节)', example: 2048576 })
  @Column()
  size: number;

  @ApiPropertyOptional({ description: '图片宽度 (px)', example: 1920 })
  @Column({ nullable: true })
  width: number;

  @ApiPropertyOptional({ description: '图片高度 (px)', example: 1080 })
  @Column({ nullable: true })
  height: number;

  @ApiPropertyOptional({ description: '上传者用户 ID' })
  @Column({ nullable: true })
  userId: string;

  @ApiProperty({ description: '文件内容的 MD5 哈希值 (用于去重和完整性校验)', example: 'd41d8cd98f00b204e9800998ecf8427e' })
  @Column()
  md5: string;

  @ApiPropertyOptional({ 
    description: '关联的上传者用户信息', 
    type: () => User
  })
  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty({ 
    description: '审核状态', 
    enum: ImageStatus, 
    default: ImageStatus.PENDING,
    example: ImageStatus.PENDING
  })
  @Column({ type: 'enum', enum: ImageStatus, default: ImageStatus.PENDING })
  @Index()
  status: ImageStatus;

  @ApiPropertyOptional({ description: '拒绝原因 (仅当状态为 rejected 时存在)', example: '图片包含违规内容' })
  @Column({ type: 'varchar', nullable: true, length: 255 })
  rejectReason: string | null;

  @ApiPropertyOptional({ description: '审核人用户 ID' })
  @Column({ type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ description: '已修改次数 (每张图片终身仅可修改一次)', default: 0 })
  @Column({ default: 0 })
  editCount: number;

  @ApiPropertyOptional({ description: '上传者 IP (用于上传限流)' })
  @Column({ type: 'varchar', nullable: true, length: 64 })
  @Index()
  uploaderIp: string | null;

  @ApiPropertyOptional({ description: '所属图集', type: () => [Album] })
  @ManyToMany(() => Album, (album) => album.images)
  albums: Album[];

  @ApiProperty({ description: '创建时间 (上传时间)' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间 (如审核状态变更时间)' })
  @UpdateDateColumn()
  updatedAt: Date;
}