// src/image/image.controller.ts
import {
  Controller, Post, Get, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, BadRequestException, Res, Req, UseGuards, HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { 
  ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, 
  ApiResponse, ApiOkResponse 
} from '@nestjs/swagger';
import { ImageService } from './image.service.js';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { RolesGuard, Roles } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { Image } from '../entities/image.entity.js'; // 👈 引入 Entity 用于定义响应类型
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
  @ApiOkResponse({ 
    description: '上传成功，返回图片信息及缩略图链接',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '图片上传成功，等待审核' },
        image: { $ref: '#/components/schemas/Image' } // 引用 Image Entity 的结构
      }
    }
  })
  @ApiResponse({ status: 400, description: '未找到文件或格式错误' })
  @ApiResponse({ status: 401, description: '未授权' })
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
  @ApiOkResponse({ type: Image, description: '审核成功，返回更新后的图片信息' })
  @ApiResponse({ status: 400, description: '拒绝时必须提供原因' })
  @ApiResponse({ status: 403, description: '权限不足' })
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
  @ApiResponse({ status: 200, description: '返回图片二进制流', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 403, description: '无权查看未通过审核的图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async getThumbnail(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const { buffer, mimeType } = await this.imageService.getThumbnail(id, req.user);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' });
    res.send(buffer);
  }

  @Get(':id/sign')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '生成带签名的限时下载链接' })
  @ApiOkResponse({
    description: '返回下载链接及过期时间',
    schema: {
      type: 'object',
      properties: {
        downloadUrl: { type: 'string', example: 'http://localhost:9910/images/xxx/download?signature=abc&expires=123' },
        expiresInMs: { type: 'number', example: 86400000 }
      }
    }
  })
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
  @ApiResponse({ status: 200, description: '返回原图二进制流', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 400, description: '签名无效或已过期' })
  @ApiResponse({ status: 403, description: '图片已被拒绝，无法下载' })
  async downloadOriginal(
    @Param('id') id: string,
    @Query() query: DownloadImageQueryDto,
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
  @ApiOkResponse({ type: Image, description: '返回图片详细信息' })
  @ApiResponse({ status: 403, description: '无权查看未通过审核的图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.imageService.findOne(id, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除图片 (本人或管理员)' })
  @ApiOkResponse({ description: '删除成功', schema: { type: 'object', properties: { message: { type: 'string', example: '图片及缓存已彻底删除' } } } })
  @ApiResponse({ status: 403, description: '无权删除此图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.imageService.remove(id, req.user);
    return { message: '图片及缓存已彻底删除' };
  }
}