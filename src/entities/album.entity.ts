// src/entities/album.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity.js';
import { Image } from './image.entity.js';
import { Tag } from './tag.entity.js';
import { AlbumVisibility } from '../enums/album-visibility.enum.js';

@Entity('albums')
export class Album {
  @ApiProperty({ description: '图集唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '图集标题', example: '我的旅行' })
  @Column({ length: 100 })
  title: string;

  @ApiPropertyOptional({ description: '图集描述', example: '2026 年旅行的照片合集' })
  @Column({ type: 'varchar', nullable: true, length: 500 })
  description: string | null;

  @ApiProperty({ description: '所属用户 ID' })
  @Column()
  @Index()
  ownerId: string;

  @ApiPropertyOptional({ description: '所属用户信息', type: () => User })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @ApiProperty({
    description: '可见性 (public 公开 / private 仅自己可见)',
    enum: AlbumVisibility,
    default: AlbumVisibility.PUBLIC,
  })
  @Column({ type: 'enum', enum: AlbumVisibility, default: AlbumVisibility.PUBLIC })
  visibility: AlbumVisibility;

  @ApiProperty({ description: '是否被管理员锁定 (锁定后本人不可修改)', default: false })
  @Column({ default: false })
  locked: boolean;

  @ApiPropertyOptional({ description: '图集内图片', type: () => [Image] })
  @ManyToMany(() => Image, (image) => image.albums)
  @JoinTable({
    name: 'album_images',
    joinColumn: { name: 'albumId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'imageId', referencedColumnName: 'id' },
  })
  images: Image[];

  @ApiPropertyOptional({ description: '图集标签', type: () => [Tag] })
  @ManyToMany(() => Tag)
  @JoinTable({
    name: 'album_tags',
    joinColumn: { name: 'albumId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  @UpdateDateColumn()
  updatedAt: Date;
}
