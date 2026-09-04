// src/image/dto/review-image.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImageStatus } from '../../enums/image-status.enum.js';

export class ReviewImageDto {
  @ApiProperty({ enum: ImageStatus, description: '审核状态 (approved / rejected)' })
  @IsEnum(ImageStatus)
  status: ImageStatus;

  @ApiPropertyOptional({ description: '拒绝原因 (当状态为 rejected 时必填)' })
  @IsOptional()
  @IsString()
  reason?: string;
}