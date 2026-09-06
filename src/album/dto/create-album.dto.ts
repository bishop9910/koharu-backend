// src/album/dto/create-album.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlbumVisibility } from '../../enums/album-visibility.enum.js';

export class CreateAlbumDto {
  @ApiProperty({ description: '图集标题', example: '我的旅行' })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ description: '图集描述', example: '2026 年旅行的照片合集' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: '可见性', enum: AlbumVisibility, default: AlbumVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(AlbumVisibility)
  visibility?: AlbumVisibility;

  @ApiPropertyOptional({ description: '标签名数组 (仅可携带已存在的标签)', type: [String], example: ['风景', '人像'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
