// src/image/dto/list-images-query.dto.ts
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ImageStatus } from '../../enums/image-status.enum.js';

export class ListImagesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      '按审核状态筛选。GET /images 默认只返回已过审图片，仅审核员及以上可按状态筛选；GET /images/my 恒为本人投稿',
    enum: ImageStatus,
    example: ImageStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ImageStatus, { message: '审核状态只能是 pending / approved / rejected' })
  status?: ImageStatus;
}
