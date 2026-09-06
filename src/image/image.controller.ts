// src/image/image.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { ImageService } from './image.service.js';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { Image } from '../entities/image.entity.js';
import { ReviewImageDto } from './dto/review-image.dto.js';
import { DownloadImageQueryDto } from './dto/download-image-query.dto.js';
import { ListImagesQueryDto } from './dto/list-images-query.dto.js';

@ApiTags('images')
@Controller('images')
export class ImageController {
  constructor(
    private readonly imageService: ImageService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: '上传图片 (需登录)', description: '仅 USER 及以上角色可上传，上传后进入待审核状态；同一 IP 每天最多上传 500 张（ADMIN/SUPER_ADMIN 不限）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({
    description: '上传成功，返回图片信息及缩略图链接',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '图片上传成功，等待审核' },
        image: { $ref: '#/components/schemas/Image' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '未找到文件或格式错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 429, description: '今日上传数量已达上限 (500 张)' })
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!req.user) throw new BadRequestException('未登录');
    if (!file) throw new BadRequestException('未找到上传的文件');

    const image = await this.imageService.upload(file, req.user, req.ip);
    return {
      message: '图片上传成功，等待审核',
      image: { ...image, thumbnailUrl: `/images/${image.id}/thumbnail` },
    };
  }

  @Post(':id/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({ summary: '审核图片 (审核员及以上)' })
  @ApiOkResponse({ type: Image, description: '审核成功，返回更新后的图片信息' })
  @ApiResponse({ status: 400, description: '拒绝时必须提供原因，或审核状态非法' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async reviewImage(
    @Param('id') id: string,
    @Body() dto: ReviewImageDto,
    @Req() req: any,
  ) {
    return this.imageService.reviewImage(id, dto.status, req.user.id, dto.reason);
  }

  @Post(':id/modify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: '修改图片 (重新投稿)', description: '仅图片所有者可操作；已过审或被拒绝的图片可修改，修改后重置为待审核，每张图片终身仅可修改一次' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({
    description: '修改成功，返回更新后的图片信息',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '图片已修改，等待重新审核' },
        image: { $ref: '#/components/schemas/Image' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '未找到文件、图片状态不允许修改、或已达修改次数上限' })
  @ApiResponse({ status: 403, description: '无权修改该图片' })
  async modify(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('未找到上传的文件');
    const image = await this.imageService.modify(id, file, req.user);
    return {
      message: '图片已修改，等待重新审核',
      image: { ...image, thumbnailUrl: `/images/${image.id}/thumbnail` },
    };
  }

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '分页获取我的投稿', description: '返回当前用户上传的所有图片（含审核状态、拒绝原因、是否已归档 archived）' })
  @ApiOkResponse({
    description: '我的投稿分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Image' } },
        total: { type: 'number', example: 10 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  async findMine(@Query() query: ListImagesQueryDto, @Req() req: any) {
    return this.imageService.findMine(req.user.id, query.page ?? 1, query.limit ?? 20);
  }

  @Get()
  @ApiOperation({ summary: '分页获取已过审图片列表', description: '公开接口，游客可访问，仅返回已通过审核的图片' })
  @ApiOkResponse({
    description: '已过审图片分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Image' } },
        total: { type: 'number', example: 120 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 6 },
      },
    },
  })
  async findAll(@Query() query: ListImagesQueryDto) {
    return this.imageService.findAll(query.page ?? 1, query.limit ?? 20);
  }

  @Get(':id/thumbnail')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取缩略图流', description: '已过审图片游客可预览；未过审图片仅审核员及以上可查看' })
  @ApiResponse({ status: 200, description: '返回图片二进制流', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 403, description: '无权查看未通过审核的图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async getThumbnail(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const { buffer, mimeType } = await this.imageService.getThumbnail(id, req.user);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' });
    res.send(buffer);
  }

  @Get(':id/sign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '生成带签名的限时下载链接', description: '仅 USER 及以上角色可生成下载链接' })
  @ApiOkResponse({
    description: '返回下载链接及过期时间',
    schema: {
      type: 'object',
      properties: {
        downloadUrl: { type: 'string', example: 'http://localhost:9910/images/xxx/download?signature=abc&expires=123' },
        expiresInMs: { type: 'number', example: 86400000 },
      },
    },
  })
  async generateSignedUrl(@Param('id') id: string, @Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const signedUrl = this.imageService.generateSignedUrl(id, baseUrl);
    return {
      downloadUrl: signedUrl,
      expiresInMs: this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 60 * 1000),
    };
  }

  @Get(':id/download')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '下载原图 (需登录 + 有效签名)', description: '仅 USER 及以上角色可下载；未过审图片仅审核员及以上可下载' })
  @ApiResponse({ status: 200, description: '返回原图二进制流', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 400, description: '签名无效或已过期' })
  @ApiResponse({ status: 403, description: '图片已被拒绝或无权下载未过审图片' })
  async downloadOriginal(
    @Param('id') id: string,
    @Query() query: DownloadImageQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename } = await this.imageService.getOriginal(id, query.signature, query.expires, req.user);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.send(buffer);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取图片详情', description: '已过审图片游客可访问；未过审图片仅审核员及以上可访问' })
  @ApiOkResponse({ type: Image, description: '返回图片详细信息' })
  @ApiResponse({ status: 403, description: '无权查看未通过审核的图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.imageService.findOne(id, req.user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除图片 (本人或上级角色)' })
  @ApiOkResponse({ description: '删除成功', schema: { type: 'object', properties: { message: { type: 'string', example: '图片及缓存已彻底删除' } } } })
  @ApiResponse({ status: 403, description: '无权删除此图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.imageService.remove(id, req.user);
    return { message: '图片及缓存已彻底删除' };
  }
}
