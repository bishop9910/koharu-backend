// src/album/dto/album-reaction.dto.ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * 点赞/收藏操作后的即时统计，结构与 AlbumBaseDto 中的四个字段一致，
 * 前端不需要重新拉取图集详情就能原位更新按钮状态。
 */
export class AlbumReactionDto {
  @ApiProperty({ format: 'uuid' })
  albumId: string;

  @ApiProperty({ description: '点赞数' })
  likeCount: number;

  @ApiProperty({ description: '收藏数' })
  favoriteCount: number;

  @ApiProperty({ description: '当前用户是否已点赞' })
  likedByMe: boolean;

  @ApiProperty({ description: '当前用户是否已收藏' })
  favoritedByMe: boolean;
}
