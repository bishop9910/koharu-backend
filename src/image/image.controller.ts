// src/image/image.controller.ts
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { ImageService } from './image.service.js';
import { ConfigService } from '@nestjs/config';

@Controller('images')
export class ImageController {
  constructor(
    private readonly imageService: ImageService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 1. 上传图片
   * POST /images?userId=xxx
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        // 从配置读取，兜底 100MB
        fileSize: 100 * 1024 * 1024,
        files: 1,
      }
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
     if (!req.user) throw new BadRequestException('未登录');
    if (!file) {
      throw new BadRequestException('未找到上传的文件');
    }

    const image = await this.imageService.upload(file, req.user.id);
    
    // 生成一个预览用的缩略图访问链接
    const thumbnailUrl = `/images/${image.id}/thumbnail`;
    
    return {
      message: '图片上传成功',
      image: {
        ...image,
        thumbnailUrl, // 方便前端直接使用
      },
    };
  }

  /**
   * 2. 获取缩略图 (用于列表/在线浏览)
   * GET /images/:id/thumbnail
   */
  @Get(':id/thumbnail')
  async getThumbnail(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.imageService.getThumbnail(id);

    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400', // 浏览器缓存 1 天
    });
    res.send(buffer);
  }

  /**
   * 3. 生成带签名的下载链接
   * GET /images/:id/sign
   */
  @Get(':id/sign')
  async generateSignedUrl(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    // 动态获取当前服务器的基础 URL (例如: http://localhost:9910)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const signedUrl = this.imageService.generateSignedUrl(id, baseUrl);

    return {
      downloadUrl: signedUrl,
      // 返回配置的过期时间（毫秒转秒方便前端理解，或者直接返回毫秒）
      expiresInMs: this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 1000),
    };
  }

  /**
   * 4. 下载原图 (需要签名验证)
   * GET /images/:id/download?signature=xxx&expires=xxx
   */
  @Get(':id/download')
  async downloadOriginal(
    @Param('id') id: string,
    @Query('signature') signature: string,
    @Query('expires') expires: string,
    @Res() res: Response,
  ) {
    if (!signature || !expires) {
      throw new BadRequestException('缺少签名或过期时间参数');
    }

    const { buffer, mimeType, filename } = await this.imageService.getOriginal(
      id,
      signature,
      expires,
    );

    // 设置下载响应头
    res.set({
      'Content-Type': mimeType,
      // 强制浏览器下载，并使用原始文件名
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate', // 下载接口不缓存
    });
    
    res.send(buffer);
  }

  /**
   * 5. 获取图片详情
   * GET /images/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.imageService.findOne(id);
  }

  /**
   * 6. 删除图片
   * DELETE /images/:id
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.imageService.remove(id);
    return { message: '图片及缓存已彻底删除' };
  }
}