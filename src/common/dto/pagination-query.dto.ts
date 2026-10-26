// src/common/dto/pagination-query.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 分页查询基类。所有分页列表接口共用同一套 page/limit 规则，
 * 避免每个 DTO 各写一遍导致上限、默认值不一致。
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: '页码 (从 1 开始)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '页码必须大于等于 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: '每页数量',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '每页数量必须大于等于 1' })
  @Max(100, { message: '每页数量不能超过 100' })
  limit?: number = 20;
}
