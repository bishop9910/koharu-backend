// src/album/album-review.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiExtraModels,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AlbumService } from './album.service.js';
import { ListAlbumsQueryDto } from './dto/list-albums-query.dto.js';
import { AlbumSummaryDto } from './dto/album-response.dto.js';
import { AlbumReviewItemDto } from './dto/album-review-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

@ApiTags('album-reviews')
@ApiBearerAuth()
@ApiExtraModels(AlbumReviewItemDto, AlbumSummaryDto)
@UseGuards(JwtAuthGuard, MinRoleGuard)
@MinRole(Role.MODERATOR)
@Controller('album-reviews')
export class AlbumReviewController {
  constructor(private readonly albumService: AlbumService) {}

  @Get('pending')
  @ApiOperation({
    summary: '待评审名单',
    description: '审核员及以上查看被打回、等待整集评审的图集，按提交时间升序；含待审图片数与已核实的举报',
  })
  @ApiOkResponse({
    description: '待评审图集分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AlbumReviewItemDto' } },
        total: { type: 'number', example: 3 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足，仅审核员及以上可查看' })
  async pending(@Query() query: ListAlbumsQueryDto) {
    return this.albumService.findPendingReviews(query);
  }
}
