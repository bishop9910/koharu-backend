// src/entities/album-favorite.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity.js';
import type { Relation } from 'typeorm';
import type { Album } from './album.entity.js';

/**
 * 图集收藏（收藏夹）。同一用户对同一图集只保留一条记录。
 */
@Entity('album_favorites')
@Unique(['albumId', 'userId'])
export class AlbumFavorite {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ format: 'uuid' })
  @Column()
  @Index()
  albumId: string;

  @ManyToOne('Album', 'favorites', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'albumId' })
  album: Relation<Album>;

  @ApiProperty({ format: 'uuid' })
  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @ApiProperty({ description: '收藏时间' })
  @CreateDateColumn()
  createdAt: Date;
}
