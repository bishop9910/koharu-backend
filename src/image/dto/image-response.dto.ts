// src/image/dto/image-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImageStatus } from '../../enums/image-status.enum.js';

/**
 * 图片详情响应体。
 *
 * 刻意不包含 Image 实体里的 path / md5 / uploaderIp / reviewedBy：
 * 详情接口游客也能访问（已过审图片），原图存储路径、上传者 IP、审核人属于内部信息。
 */
export class ImageResponseDto {
  @ApiProperty({ description: '图片唯一标识 (UUID)' })
  id: string;

  @ApiProperty({ description: '原始文件名', example: 'vacation_photo.jpg' })
  filename: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: '缩略图相对路径', example: '/image_cache/thumb_xxx.webp' })
  thumbnailPath: string | null;

  @ApiProperty({ description: '缩略图访问地址', example: '/images/550e8400-e29b-41d4-a716-446655440000/thumbnail' })
  thumbnailUrl: string;

  @ApiProperty({ description: 'MIME 类型', example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ description: '文件大小 (字节)', example: 2048576 })
  size: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '图片宽度 (px)', example: 1920 })
  width: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '图片高度 (px)', example: 1080 })
  height: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '上传者用户 ID' })
  userId: string | null;

  @ApiProperty({ description: '审核状态', enum: ImageStatus, example: ImageStatus.APPROVED })
  status: ImageStatus;

  @ApiPropertyOptional({ type: String, nullable: true, description: '拒绝原因 (仅当状态为 rejected 时存在)' })
  rejectReason: string | null;

  @ApiProperty({ description: '已修改次数 (每张图片终身仅可修改一次)', default: 0 })
  editCount: number;

  @ApiProperty({ description: '创建时间 (上传时间)' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间 (如审核状态变更时间)' })
  updatedAt: Date;
}
