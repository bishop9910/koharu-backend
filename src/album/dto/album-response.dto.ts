// src/album/dto/album-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { AlbumVisibility } from '../../enums/album-visibility.enum.js';
import { ImageStatus } from '../../enums/image-status.enum.js';

export class AlbumOwnerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  username: string;
}

export class AlbumTagDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class AlbumBaseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: AlbumVisibility })
  visibility: AlbumVisibility;

  @ApiProperty({ description: '被管理员锁定后只有管理员能改回公开' })
  locked: boolean;

  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '创建者 id，创建者已注销为 null' })
  ownerId: string | null;

  @ApiProperty({ type: AlbumOwnerDto, nullable: true })
  owner: AlbumOwnerDto | null;

  @ApiProperty({ type: [AlbumTagDto] })
  tags: AlbumTagDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AlbumSummaryDto extends AlbumBaseDto {
  @ApiProperty({ description: '图集内图片数量' })
  imageCount: number;
}

export class AlbumImageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty({ nullable: true, type: String })
  thumbnailPath: string | null;

  @ApiProperty({ description: '可直接访问的缩略图地址' })
  thumbnailUrl: string;

  @ApiProperty({ enum: ImageStatus })
  status: ImageStatus;
}

export class AlbumDetailDto extends AlbumBaseDto {
  @ApiProperty({ type: [AlbumImageDto] })
  images: AlbumImageDto[];
}
