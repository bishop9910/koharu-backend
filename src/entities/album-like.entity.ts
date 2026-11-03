// src/entities/album-like.entity.ts
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
 * 图集点赞。同一用户对同一图集只保留一条记录（Unique 约束 + 幂等写入）。
 */
@Entity('album_likes')
@Unique(['albumId', 'userId'])
export class AlbumLike {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ format: 'uuid' })
  @Column()
  @Index()
  albumId: string;

  // 用字符串目标而不是 () => Album，避免 album.entity 与本文件形成运行时循环依赖
  @ManyToOne('Album', 'likes', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'albumId' })
  album: Relation<Album>;

  @ApiProperty({ format: 'uuid' })
  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @ApiProperty({ description: '点赞时间' })
  @CreateDateColumn()
  createdAt: Date;
}
