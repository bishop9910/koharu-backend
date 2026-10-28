// src/review/review-exemption.controller.ts
import { Controller, Get, Post, Delete, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiExtraModels,
} from '@nestjs/swagger';
import { ReviewExemptionService } from './review-exemption.service.js';
import { ReviewExemptionItemDto } from './dto/review-exemption-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';

/**
 * 自审赦免名单管理：管理员及以上可以把审核员加进名单，
 * 名单内的审核员就获得了「审核自己上传的图片 / 提交的头像」的资格。
 * 管理员及以上本身天然豁免，无需也无法加入名单。
 */
@ApiTags('review-exemptions')
@ApiExtraModels(ReviewExemptionItemDto)
@Controller('review-exemptions')
export class ReviewExemptionController {
  constructor(private readonly reviewExemptionService: ReviewExemptionService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({
    summary: '获取自审赦免名单',
    description: '仅限管理员及以上角色访问。只列出被显式授予赦免的审核员；管理员及以上天然豁免，不出现在名单中。',
  })
  @ApiOkResponse({
    description: '赦免名单',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/ReviewExemptionItemDto' } },
        total: { type: 'number', example: 1 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 及以上角色' })
  async findAll() {
    const data = await this.reviewExemptionService.list();
    return { data, total: data.length };
  }

  @Post(':userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({
    summary: '将审核员加入自审赦免名单',
    description:
      '仅限管理员及以上角色访问。加入后该审核员可以审核自己上传的图片与提交的头像。管理员及以上角色默认可审核自己的图片，无需加入。',
  })
  @ApiCreatedResponse({ description: '已加入赦免名单，返回该条目', type: ReviewExemptionItemDto })
  @ApiResponse({ status: 400, description: '目标角色没有审核权限（USER / GUEST）' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 及以上角色' })
  @ApiNotFoundResponse({ description: '用户不存在' })
  @ApiConflictResponse({ description: '目标已是管理员及以上，或已在赦免名单中' })
  async grant(@Param('userId', ParseUUIDPipe) userId: string, @Req() req: any) {
    return this.reviewExemptionService.grant(userId, req.user);
  }

  @Delete(':userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.ADMIN)
  @ApiOperation({
    summary: '将审核员移出自审赦免名单',
    description: '仅限管理员及以上角色访问。移出后该审核员恢复为「不能审核自己上传的图片 / 提交的头像」。',
  })
  @ApiOkResponse({
    description: '已移出赦免名单',
    schema: { type: 'object', properties: { message: { type: 'string', example: '已移出自审赦免名单' } } },
  })
  @ApiResponse({ status: 400, description: '目标是管理员及以上角色（本就豁免，不在名单中）' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '权限不足：需要 ADMIN 及以上角色' })
  @ApiNotFoundResponse({ description: '用户不存在，或该用户不在赦免名单中' })
  async revoke(@Param('userId', ParseUUIDPipe) userId: string, @Req() req: any) {
    return this.reviewExemptionService.revoke(userId, req.user);
  }
}
