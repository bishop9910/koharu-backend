// src/album/dto/update-album-images.dto.ts
import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAlbumImagesDto {
  @ApiProperty({
    description: '图片 ID 数组 (仅可归档已过审的图片)',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  imageIds: string[];
}
