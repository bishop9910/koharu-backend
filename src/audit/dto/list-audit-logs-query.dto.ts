// src/audit/dto/list-audit-logs-query.dto.ts
import { IsOptional, IsInt, Min, Max, IsString, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ description: '页码 (从 1 开始)', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '按操作者用户 ID 过滤', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: '按操作动作模糊过滤', example: '/users/:id/role' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: '起始时间 (ISO 8601)', example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)', example: '2026-09-30T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
