// src/album/dto/create-album-report.dto.ts
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAlbumReportDto {
  @ApiProperty({ description: '举报原因', maxLength: 500, example: '图集包含违规内容' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ description: '补充说明', maxLength: 1000, example: '第三张图片疑似侵权' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}
