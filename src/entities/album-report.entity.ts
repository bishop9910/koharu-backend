// src/entities/album-report.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity.js';
import { ReportStatus } from '../enums/report-status.enum.js';
import type { Relation } from 'typeorm';
import type { Album } from './album.entity.js';

/**
 * 图集举报。审核员核实（verified）后图集进入待评审名单；
 * 举报人注销时 reporterId 置空，但举报记录保留。
 */
@Entity('album_reports')
@Index(['albumId', 'status'])
export class AlbumReport {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ format: 'uuid' })
  @Column()
  @Index()
  albumId: string;

  @ManyToOne('Album', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'albumId' })
  album: Relation<Album>;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '举报人 id，举报人注销后为 null' })
  @Column({ type: 'uuid', nullable: true })
  reporterId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporterId' })
  reporter: Relation<User> | null;

  @ApiProperty({ description: '举报原因', maxLength: 500 })
  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @ApiPropertyOptional({ description: '补充说明', maxLength: 1000 })
  @Column({ type: 'varchar', nullable: true, length: 1000 })
  detail: string | null;

  @ApiProperty({ enum: ReportStatus, description: '举报处理状态', default: ReportStatus.PENDING })
  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDING })
  @Index()
  status: ReportStatus;

  @ApiPropertyOptional({ description: '处理人用户 ID' })
  @Column({ type: 'varchar', nullable: true })
  handledBy: string | null;

  @ApiPropertyOptional({ description: '处理时间' })
  @Column({ type: 'timestamp', nullable: true })
  handledAt: Date | null;

  @ApiPropertyOptional({ description: '核实/驳回说明', maxLength: 500 })
  @Column({ type: 'varchar', nullable: true, length: 500 })
  resolutionNote: string | null;

  @ApiProperty({ description: '举报时间' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  @UpdateDateColumn()
  updatedAt: Date;
}
