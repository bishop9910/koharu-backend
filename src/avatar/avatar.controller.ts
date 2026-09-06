// src/avatar/avatar.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Req,
  UseGuards,
  Body,
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
} from '@nestjs/swagger';
import { AvatarService } from './avatar.service.js';
import { FileService } from '../common/file/file.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { ReviewAvatarDto } from './dto/review-avatar.dto.js';

@ApiTags('avatars')
@Controller('avatars')
export class AvatarController {
  constructor(
    private readonly avatarService: AvatarService,
    private readonly fileService: FileService,
  ) {}

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
        submission: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', example: 'pending' } } },
      },
    },
  })
  @ApiResponse({ status: 400, description: '未找到文件或格式不支持' })
  @ApiResponse({ status: 409, description: '已有待审核的头像' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async submit(
    @Param('userId') userId: string,
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
      },
    };
  }

  @Post(':userId/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({ summary: '审核头像 (审核员及以上)', description: 'approved 会替换当前头像；rejected 会作废投稿并回退到上一个头像' })
  @ApiOkResponse({ description: '审核完成' })
  @ApiResponse({ status: 400, description: '拒绝时必须提供原因，或审核状态非法' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '该用户没有待审核的头像' })
  async review(
    @Param('userId') userId: string,
    @Body() dto: ReviewAvatarDto,
    @Req() req: any,
  ) {
    return this.avatarService.review(userId, dto.status, req.user.id, dto.reason);
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
  @ApiResponse({ status: 400, description: '该用户暂无头像或文件读取失败' })
  async getImage(
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    const avatar = await this.avatarService.findByUserId(userId);
    if (!avatar) {
      throw new BadRequestException('该用户暂无头像');
    }

    try {
      const buffer = await this.fileService.readFile(avatar.path);
      const ext = avatar.path.split('.').pop()?.toLowerCase() || '';

      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      };

      res.set({
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      });
      res.send(buffer);
    } catch {
      throw new BadRequestException('头像文件读取失败');
    }
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
  async remove(@Param('userId') userId: string, @Req() req: any) {
    await this.avatarService.remove(userId, req.user);
    return { message: '头像已删除' };
  }
}
