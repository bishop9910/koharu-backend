// src/avatar/avatar.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Req,
  UseGuards,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiCookieAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AvatarService } from './avatar.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../enums/role.enum.js';
import { ReviewAvatarDto } from './dto/review-avatar.dto.js';
import { API_PREFIX } from '../common/constants.js';

@ApiTags('avatars')
@Controller('avatars')
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post(':userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '提交头像 (需登录)', description: '仅本人可提交，提交后进入待审核状态，审核通过后才会成为当前头像' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({
    description: '头像提交成功，等待审核',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '头像已提交，等待审核' },
        submission: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'], example: 'pending' },
            createdAt: { type: 'string', format: 'date-time' },
            imageUrl: { type: 'string', example: '/api/avatars/550e8400-e29b-41d4-a716-446655440000/pending/image' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '未找到文件或格式不支持' })
  @ApiResponse({ status: 409, description: '已有待审核的头像' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async submit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('未找到上传的文件');
    }

    const submission = await this.avatarService.submit(userId, file, req.user);

    return {
      message: '头像已提交，等待审核',
      submission: {
        id: submission.id,
        status: submission.status,
        createdAt: submission.createdAt,
        // 本人凭登录态（Cookie 或 Bearer）即可预览，无需等待审核
        imageUrl: `/${API_PREFIX}/avatars/${userId}/pending/image`,
      },
    };
  }

  @Post(':userId/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({ summary: '审核头像 (审核员及以上)', description: 'approved 会替换当前头像；rejected 会作废投稿并回退到上一个头像。默认不能审核自己提交的头像；管理员及以上角色天然豁免，被加入自审赦免名单的审核员同样可以审核自己的头像。两种结果的响应形状一致，avatar 为 null 表示没有产生当前头像' })
  @ApiOkResponse({
    description: '审核完成',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '头像已通过审核' },
        status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
        avatar: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
          description: '通过时为新当前头像的标识；拒绝时（或头像记录不落库时）为 null',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '拒绝时必须提供原因，或审核状态非法' })
  @ApiResponse({ status: 403, description: '权限不足，或试图审核自己提交的头像且未获得自审赦免' })
  @ApiResponse({ status: 404, description: '该用户没有待审核的头像' })
  async review(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ReviewAvatarDto,
    @Req() req: any,
  ) {
    return this.avatarService.review(userId, dto.status, req.user, dto.reason);
  }

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({
    summary: '获取待审核头像队列 (审核员及以上)',
    description: '按提交时间正序返回待审核头像的 userId 与用户名，POST /avatars/:userId/review 的 :userId 即取自这里',
  })
  @ApiOkResponse({
    description: '待审核头像分页列表',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              submissionId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              username: { type: 'string', nullable: true, example: 'alice' },
              status: { type: 'string', enum: ['pending', 'approved', 'rejected'], example: 'pending' },
              imageUrl: {
                type: 'string',
                example: '/api/avatars/550e8400-e29b-41d4-a716-446655440000/pending/image',
              },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'number', example: 2 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: 403, description: '权限不足：需要 MODERATOR 及以上角色' })
  async findPending(@Query() query: PaginationQueryDto) {
    return this.avatarService.findPending(query.page ?? 1, query.limit ?? 20);
  }

  @Get(':userId/pending/image')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiSecurity('bearer')
  @ApiCookieAuth('koharu_token')
  @ApiQuery({ name: 'access_token', required: false, description: 'JWT，供无法设置请求头的 <img> 等原生请求使用' })
  @ApiOperation({
    summary: '获取待审核头像图片流',
    description: '本人可看自己待审核的头像（提交后即刻预览），审核员及以上可看任意用户的；其余 403。凭证可用 Authorization: Bearer、koharu_token Cookie 或 ?access_token=',
  })
  @ApiResponse({
    status: 200,
    description: '返回待审核头像二进制流',
    content: {
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/webp': { schema: { type: 'string', format: 'binary' } },
      'image/gif': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 403, description: '无权查看其他用户的待审核头像' })
  @ApiResponse({ status: 401, description: '未携带任何凭证，或携带的凭证已失效' })
  @ApiResponse({ status: 404, description: '该用户没有待审核的头像' })
  async getPendingImage(@Param('userId', ParseUUIDPipe) userId: string, @Req() req: any, @Res() res: Response) {
    const { buffer, mimeType } = await this.avatarService.getPendingImage(userId, req.user);
    // private：待审头像只对本人与审核员开放，不能被共享缓存留存
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' });
    res.send(buffer);
  }

  @Get(':userId/image')
  @ApiOperation({ summary: '获取用户当前头像图片流', description: '公开接口，游客可访问，仅展示已过审的当前头像' })
  @ApiResponse({
    status: 200,
    description: '返回头像图片二进制流',
    content: {
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/webp': { schema: { type: 'string', format: 'binary' } },
      'image/gif': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 400, description: '该用户暂无头像' })
  @ApiResponse({ status: 404, description: '头像文件不存在' })
  async getImage(@Param('userId', ParseUUIDPipe) userId: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.avatarService.getCurrentImage(userId);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' });
    res.send(buffer);
  }

  @Delete(':userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除用户头像', description: '仅本人或具备管理权限的上级角色可删除' })
  @ApiOkResponse({
    description: '头像删除成功',
    schema: { type: 'object', properties: { message: { type: 'string', example: '头像已删除' } } },
  })
  @ApiResponse({ status: 404, description: '该用户暂无头像' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  @ApiForbiddenResponse({ description: '无权删除该用户的头像' })
  async remove(@Param('userId', ParseUUIDPipe) userId: string, @Req() req: any) {
    await this.avatarService.remove(userId, req.user);
    return { message: '头像已删除' };
  }
}
