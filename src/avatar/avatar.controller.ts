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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AvatarService } from './avatar.service.js';
import { FileService } from '../common/file/file.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';

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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 7 * 1024 * 1024, // 7MB (与配置保持一致)
        files: 1,
      },
      fileFilter: (_req, file, cb) => {
        // 初步 MIME 过滤 (FileService 还会做二次 Magic Bytes 校验)
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('仅支持 JPG, PNG, WebP, GIF 格式'), false);
        }
      },
    }),
  )
  async upsert(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('未找到上传的文件');
    }

    const avatar = await this.avatarService.upsert(userId, file);
    
    return {
      message: '头像更新成功',
      avatar: {
        id: avatar.id,
        path: avatar.path, // 前端可通过 baseUrl + path 直接访问
        createdAt: avatar.createdAt,
      },
    };
  }

  /**
   * 获取头像图片流 (可选：如果不想用静态文件服务，可用此接口)
   * GET /avatars/:userId/image
   */
  @Get(':userId/image')
  @UseGuards(JwtAuthGuard)
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
      
      // 设置正确的 Content-Type 和缓存策略
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      };

      res.set({
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400', // 浏览器缓存 1 天
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
  async remove(@Param('userId') userId: string) {
    await this.avatarService.remove(userId);
    return { message: '头像已删除' };
  }
}