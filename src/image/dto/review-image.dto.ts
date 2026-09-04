// src/image/dto/review-image.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImageStatus } from '../../enums/image-status.enum.js';

export class ReviewImageDto {
  @ApiProperty({ 
    enum: ImageStatus, 
    description: '审核状态 (approved / rejected)', 
    example: ImageStatus.APPROVED  
  })
  @IsEnum(ImageStatus)
  status: ImageStatus;

  @ApiPropertyOptional({ 
    description: '拒绝原因 (当状态为 rejected 时必填)',
    example: "涉及社会敏感话题，引流等等..."
  })
  @IsOptional()
  @IsString()
  reason?: string;
}