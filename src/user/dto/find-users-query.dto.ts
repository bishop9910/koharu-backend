// src/user/dto/find-users-query.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FindUsersQueryDto {
  @IsOptional()
  @Type(() => Number) // 将 URL 字符串参数转换为数字
  @IsInt()
  @Min(1, { message: '页码必须大于等于 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '每页数量必须大于等于 1' })
  @Max(100, { message: '每页数量不能超过 100' }) // 防止恶意请求拉取过多数据
  limit?: number = 20;
}