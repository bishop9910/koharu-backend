// src/avatar/dto/review-avatar.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvatarStatus } from '../../enums/avatar-status.enum.js';

export class ReviewAvatarDto {
  @ApiProperty({
    enum: AvatarStatus,
    description: '审核状态 (approved / rejected)',
    example: AvatarStatus.APPROVED,
  })
  @IsEnum(AvatarStatus)
  status: AvatarStatus;

  @ApiPropertyOptional({
    description: '拒绝原因 (当状态为 rejected 时必填)',
    example: '头像包含违规内容',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
