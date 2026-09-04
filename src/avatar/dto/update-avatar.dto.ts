// src/avatar/dto/update-avatar.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({ 
    type: 'string', 
    format: 'binary', 
    description: '头像图片文件 (支持 JPG, PNG, WebP, GIF)' 
  })
  file: any; 

  @ApiPropertyOptional({ 
    description: '头像描述或备注', 
    example: "无描述"
  })
  @IsOptional()
  @IsString()
  description?: string;
}