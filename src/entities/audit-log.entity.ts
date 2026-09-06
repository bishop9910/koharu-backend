// src/entities/audit-log.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('audit_logs')
export class AuditLog {
  @ApiProperty({ description: '日志唯一标识 (UUID)' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiPropertyOptional({ description: '操作者用户 ID (未登录为 null)' })
  @Column({ type: 'varchar', nullable: true, length: 36 })
  @Index()
  actorId: string | null;

  @ApiPropertyOptional({ description: '操作者用户名快照' })
  @Column({ type: 'varchar', nullable: true, length: 50 })
  actorUsername: string | null;

  @ApiPropertyOptional({ description: '操作者角色快照' })
  @Column({ type: 'varchar', nullable: true, length: 20 })
  actorRole: string | null;

  @ApiProperty({ description: '操作动作，如 "POST /auth/login"', example: 'PATCH /users/:id/role' })
  @Column({ type: 'varchar', length: 200 })
  @Index()
  action: string;

  @ApiPropertyOptional({ description: 'HTTP 方法', example: 'PATCH' })
  @Column({ type: 'varchar', nullable: true, length: 10 })
  method: string | null;

  @ApiPropertyOptional({ description: '请求路径 (不含查询参数)' })
  @Column({ type: 'varchar', nullable: true, length: 500 })
  path: string | null;

  @ApiPropertyOptional({ description: 'HTTP 状态码' })
  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @ApiPropertyOptional({ description: '请求来源 IP' })
  @Column({ type: 'varchar', nullable: true, length: 64 })
  ip: string | null;

  @ApiPropertyOptional({ description: '客户端 User-Agent' })
  @Column({ type: 'varchar', nullable: true, length: 500 })
  userAgent: string | null;

  @ApiPropertyOptional({ description: '请求耗时 (毫秒)' })
  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @ApiPropertyOptional({ description: '附加上下文 (如登录用户名)' })
  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, any> | null;

  @ApiProperty({ description: '是否成功 (状态码 < 400)' })
  @Column({ default: true })
  success: boolean;

  @ApiProperty({ description: '发生时间' })
  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
