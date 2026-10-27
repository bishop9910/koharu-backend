// src/entities/library-secret.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/** 包裹后的数据密钥：KEK（由图库密码派生）只包裹它，不直接加密文件内容。 */
export interface WrappedDataKey {
  /** 数据密钥版本号，写入每个加密文件的头部，用于换密码期间的过渡读取 */
  version: number;
  /** base64(iv.tag.ciphertext)，由当前图库密码派生的 KEK 用 AES-256-GCM 包裹 */
  wrappedKey: string;
}

/** 轮转状态：idle 空闲；running 正在用新密钥重加密全部图片；failed 中途失败（可重试） */
export type LibraryRotationStatus = 'idle' | 'running' | 'failed';

/**
 * 图库密钥（全库只允许一行）。
 *
 * 设计要点：
 * - 文件内容用随机生成的「数据密钥」做 AES-256-GCM 加密，数据密钥本身用「图库密码」
 *   经 scrypt 派生的 KEK 包裹后存在这里。改密码只需重新包裹数据密钥，不必立刻重写全库文件。
 * - 改密码时同时生成新一代数据密钥（version+1），后台逐个文件重加密；旧版本密钥保留到
 *   轮转结束，保证轮转期间新旧文件都能读。
 */
@Entity('library_secrets')
export class LibrarySecret {
  @ApiProperty({ description: '记录唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'scrypt 盐值 (base64)' })
  @Column({ length: 64 })
  salt: string;

  @ApiProperty({ description: '图库密码的 bcrypt 哈希，用于校验旧密码' })
  @Column({ length: 255 })
  passwordHash: string;

  @ApiProperty({ description: '当前生效的数据密钥版本' })
  @Column({ type: 'int', default: 1 })
  activeVersion: number;

  @ApiProperty({ description: '全部数据密钥（按版本）', type: 'array', items: { type: 'object' } })
  @Column({ type: 'jsonb', default: () => "'[]'" })
  keys: WrappedDataKey[];

  @ApiProperty({ description: '密钥轮转状态', enum: ['idle', 'running', 'failed'], default: 'idle' })
  @Column({ type: 'varchar', length: 16, default: 'idle' })
  rotationStatus: LibraryRotationStatus;

  @ApiProperty({ description: '本次轮转需要重加密的文件总数' })
  @Column({ type: 'int', default: 0 })
  rotationTotal: number;

  @ApiProperty({ description: '本次轮转已完成的文件数' })
  @Column({ type: 'int', default: 0 })
  rotationDone: number;

  @ApiProperty({ description: '轮转失败原因', nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  rotationError: string | null;

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  @UpdateDateColumn()
  updatedAt: Date;
}
