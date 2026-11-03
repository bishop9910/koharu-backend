// src/entities/album.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  OneToMany,
  JoinColumn,
  JoinTable,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity.js';
import { Image } from './image.entity.js';
import { Tag } from './tag.entity.js';
import { AlbumLike } from './album-like.entity.js';
import { AlbumFavorite } from './album-favorite.entity.js';
import { AlbumVisibility } from '../enums/album-visibility.enum.js';
import { AlbumReviewStatus } from '../enums/album-review-status.enum.js';

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

  @ApiProperty({
    description: '评审状态：none 未进入评审 / pending 待评审 / approved 通过 / rejected 未通过',
    enum: AlbumReviewStatus,
    default: AlbumReviewStatus.NONE,
  })
  @Column({ type: 'enum', enum: AlbumReviewStatus, default: AlbumReviewStatus.NONE })
  @Index()
  reviewStatus: AlbumReviewStatus;

  @ApiProperty({ description: '本轮评审是否已使用过修改机会（被驳回后不可再改，只能重新提交）', default: false })
  @Column({ default: false })
  reviewEditUsed: boolean;

  @ApiPropertyOptional({ description: '最近一次提交评审时间', nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  reviewSubmittedAt: Date | null;

  @ApiProperty({ description: '已提交评审的轮次', default: 0 })
  @Column({ default: 0 })
  reviewRound: number;

  @ApiPropertyOptional({ description: '最近一次审核人用户 ID', nullable: true })
  @Column({ type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @ApiPropertyOptional({ description: '最近一次审核时间', nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @ApiPropertyOptional({ description: '评审驳回原因', nullable: true })
  @Column({ type: 'varchar', nullable: true, length: 255 })
  reviewRejectReason: string | null;

  @ApiPropertyOptional({ description: '点赞记录', type: () => [AlbumLike] })
  @OneToMany(() => AlbumLike, (like) => like.album)
  likes: AlbumLike[];

  @ApiPropertyOptional({ description: '收藏记录', type: () => [AlbumFavorite] })
  @OneToMany(() => AlbumFavorite, (favorite) => favorite.album)
  favorites: AlbumFavorite[];

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
