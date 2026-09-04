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
  ApiConsumes,
  ApiBody
} from '@nestjs/swagger';
import { AvatarService } from './avatar.service.js';
import { FileService } from '../common/file/file.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { UpdateAvatarDto } from './dto/update-avatar.dto.js';

@ApiTags('avatars')
@ApiBearerAuth()
@Controller('avatars')
export class AvatarController {
  constructor(
    private readonly avatarService: AvatarService,
    private readonly fileService: FileService,
  ) {}

  /**
   * 上传/更新头像
   * POST /avatars/:userId
   */
  @Post(':userId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file')) // 👈 拦截器只负责提取文件，校验逻辑交给 Service/FileService
  @ApiOperation({ summary: '上传或更新用户头像' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateAvatarDto }) // 👈 关联 DTO，Swagger 会自动解析出 file 字段
  @ApiOkResponse({
    description: '头像更新成功',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '头像更新成功' },
        avatar: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            path: { type: 'string', example: '/uploads/avatars/xxx.jpg' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '未找到文件或格式不支持' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async upsert(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateAvatarDto, // 👈 接收 DTO，虽然目前主要用 file
  ) {
    if (!file) {
      throw new BadRequestException('未找到上传的文件');
    }

    const avatar = await this.avatarService.upsert(userId, file);
    
    return {
      message: '头像更新成功',
      avatar: {
        id: avatar.id,
        path: avatar.path,
        createdAt: avatar.createdAt,
      },
    };
  }

  /**
   * 获取头像图片流
   * GET /avatars/:userId/image
   */
  @Get(':userId/image')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取用户头像图片流' })
  @ApiResponse({ 
    status: 200, 
    description: '返回头像图片二进制流', 
    content: { 
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/webp': { schema: { type: 'string', format: 'binary' } },
      'image/gif': { schema: { type: 'string', format: 'binary' } },
    } 
  })
  @ApiResponse({ status: 400, description: '该用户暂无头像或文件读取失败' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
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
    } catch (error) {
      throw new BadRequestException('头像文件读取失败');
    }
  }

  /**
   * 删除头像
   * DELETE /avatars/:userId
   */
  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除用户头像' })
  @ApiOkResponse({ 
    description: '头像删除成功',
    schema: { type: 'object', properties: { message: { type: 'string', example: '头像已删除' } } }
  })
  @ApiResponse({ status: 400, description: '该用户暂无头像' })
  @ApiUnauthorizedResponse({ description: '未提供有效的 Token' })
  async remove(@Param('userId') userId: string) {
    await this.avatarService.remove(userId);
    return { message: '头像已删除' };
  }
}