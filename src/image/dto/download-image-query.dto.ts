// src/image/dto/download-image-query.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DownloadImageQueryDto {
  @ApiProperty({ description: 'HMAC 下载签名' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: '过期时间戳 (毫秒)' })
  @IsString()
  @IsNotEmpty()
  expires: string;
}