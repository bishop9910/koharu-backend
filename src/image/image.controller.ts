// src/image/image.controller.ts
import {
  Controller, Post, Get, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException, Res, Req, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ImageService } from './image.service.js';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { RolesGuard, Roles } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { ReviewImageDto } from './dto/review-image.dto.js';
import { DownloadImageQueryDto } from './dto/download-image-query.dto.js';

@ApiTags('images')
@ApiBearerAuth()
@Controller('images')
export class ImageController {
  constructor(
    private readonly imageService: ImageService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: '上传图片 (需登录)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!req.user) throw new BadRequestException('未登录');
    if (!file) throw new BadRequestException('未找到上传的文件');

    const image = await this.imageService.upload(file, req.user.id);
    return {
      message: '图片上传成功，等待审核',
      image: { ...image, thumbnailUrl: `/images/${image.id}/thumbnail` },
    };
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: '审核图片 (仅管理员/审核员)' })
  async reviewImage(
    @Param('id') id: string,
    @Body() dto: ReviewImageDto,
    @Req() req: any,
  ) {
    return this.imageService.reviewImage(id, dto.status, req.user.id, dto.reason);
  }

  @Get(':id/thumbnail')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取缩略图流' })
  async getThumbnail(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const { buffer, mimeType } = await this.imageService.getThumbnail(id, req.user);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' });
    res.send(buffer);
  }

  @Get(':id/sign')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '生成带签名的限时下载链接' })
  async generateSignedUrl(@Param('id') id: string, @Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const signedUrl = this.imageService.generateSignedUrl(id, baseUrl);
    return {
      downloadUrl: signedUrl,
      expiresInMs: this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 1000),
    };
  }

  @Get(':id/download')
  @ApiOperation({ summary: '验证签名并下载原图 (无需 JWT，靠签名验证)' })
  async downloadOriginal(
    @Param('id') id: string,
    @Query() query: DownloadImageQueryDto, // 使用 DTO 校验参数
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename } = await this.imageService.getOriginal(id, query.signature, query.expires);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.send(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取图片详情' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.imageService.findOne(id, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除图片 (本人或管理员)' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.imageService.remove(id, req.user);
    return { message: '图片及缓存已彻底删除' };
  }
}