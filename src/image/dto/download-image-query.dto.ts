// src/image/dto/download-image-query.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DownloadImageQueryDto {
  @ApiProperty({ 
    description: 'HMAC 下载签名', 
    example: 'a1b2c3d4e5f6...' 
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ 
    description: '过期时间戳 (毫秒)', 
    example: Date.now() + 86400000 // 示例值为当前时间往后推一天
  })
  @IsString()
  @IsNotEmpty()
  expires: string;
}