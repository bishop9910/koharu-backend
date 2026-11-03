// src/album/dto/review-album.dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlbumReviewStatus } from '../../enums/album-review-status.enum.js';

export class ReviewAlbumDto {
  @ApiProperty({
    description: '整集评审结果：approved 通过（同图集内待审图片一并过审）/ rejected 驳回（同图集内待审图片一并驳回）',
    enum: [AlbumReviewStatus.APPROVED, AlbumReviewStatus.REJECTED],
  })
  @IsEnum(AlbumReviewStatus)
  status: AlbumReviewStatus;

  @ApiPropertyOptional({ description: '驳回原因（status=rejected 时必填）', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
