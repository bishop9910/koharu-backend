// src/image/dto/image-list-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { ImageStatus } from '../../enums/image-status.enum.js';

/** 公开图片列表项：与 image.service.findAll 的查询投影一一对应。 */
export class ImageListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: '上传时的原始文件名' })
  filename: string;

  @ApiProperty({ nullable: true, type: String, description: '缩略图在存储中的相对路径' })
  thumbnailPath: string | null;

  @ApiProperty({ description: '可直接访问的缩略图地址' })
  thumbnailUrl: string;

  @ApiProperty({ description: '原图 MIME 类型' })
  mimeType: string;

  @ApiProperty({ description: '文件字节数' })
  size: number;

  @ApiProperty({ nullable: true, type: Number })
  width: number | null;

  @ApiProperty({ nullable: true, type: Number })
  height: number | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '上传者 id，匿名上传为 null' })
  userId: string | null;

  @ApiProperty({ enum: ImageStatus })
  status: ImageStatus;

  @ApiProperty()
  createdAt: Date;
}

/** 我的图片列表项：额外带审核意见与归档状态。 */
export class MyImageListItemDto extends ImageListItemDto {
  @ApiProperty({ nullable: true, type: String, description: '仅被拒绝时有值' })
  rejectReason: string | null;

  @ApiProperty({ description: '是否已归档进任意图集' })
  archived: boolean;
}

/** 待审核队列项：比公开列表多一个上传者用户名。 */
export class PendingImageDto extends ImageListItemDto {
  @ApiProperty({ nullable: true, type: String, description: '上传者用户名，上传者已注销时为 null' })
  username: string | null;
}
