// src/album/dto/search-albums-query.dto.ts
import { IsOptional, IsInt, Min, Max, IsString, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchAlbumsQueryDto {
  @ApiPropertyOptional({ description: '关键词 (对标题和描述做模糊匹配)', example: '旅行' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: '标签名数组 (需全部命中)', type: [String], example: ['风景', '人像'] })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  tags?: string[];

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
}
