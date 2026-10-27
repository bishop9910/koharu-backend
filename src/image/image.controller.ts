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
  ParseUUIDPipe,
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
  ApiExtraModels,
} from '@nestjs/swagger';
import { ImageService } from './image.service.js';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard.js';
import { MinRoleGuard, MinRole } from '../common/guards/role.guard.js';
import { Role } from '../enums/role.enum.js';
import { ReviewImageDto } from './dto/review-image.dto.js';
import { DownloadImageQueryDto } from './dto/download-image-query.dto.js';
import { ListImagesQueryDto } from './dto/list-images-query.dto.js';
import { ImageResponseDto } from './dto/image-response.dto.js';
import { ImageListItemDto, MyImageListItemDto, PendingImageDto } from './dto/image-list-item.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';

@ApiTags('images')
@ApiExtraModels(ImageListItemDto, MyImageListItemDto, PendingImageDto)
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
        image: { $ref: '#/components/schemas/ImageResponseDto' },
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
    return { message: '图片上传成功，等待审核', image };
  }

  @Post(':id/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({ summary: '审核图片 (审核员及以上)' })
  @ApiOkResponse({ type: ImageResponseDto, description: '审核成功，返回更新后的图片信息' })
  @ApiResponse({ status: 400, description: '拒绝时必须提供原因，或审核状态非法' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  @ApiResponse({ status: 409, description: '图片已是目标状态，或审核期间被其他审核员抢先处理' })
  async reviewImage(
    @Param('id', ParseUUIDPipe) id: string,
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
        image: { $ref: '#/components/schemas/ImageResponseDto' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '未找到文件、图片状态不允许修改、或已达修改次数上限' })
  @ApiResponse({ status: 403, description: '无权修改该图片' })
  async modify(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('未找到上传的文件');
    const image = await this.imageService.modify(id, file, req.user);
    return { message: '图片已修改，等待重新审核', image };
  }

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '分页获取我的投稿', description: '返回当前用户上传的所有图片（含审核状态、拒绝原因、是否已归档 archived），可用 status 只看某一审核状态' })
  @ApiOkResponse({
    description: '我的投稿分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/MyImageListItemDto' } },
        total: { type: 'number', example: 10 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  async findMine(@Query() query: ListImagesQueryDto, @Req() req: any) {
    return this.imageService.findMine(req.user.id, query.page ?? 1, query.limit ?? 20, query.status);
  }

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, MinRoleGuard)
  @MinRole(Role.MODERATOR)
  @ApiOperation({
    summary: '获取待审核图片队列 (审核员及以上)',
    description: '按上传时间正序（先来先审）返回待审核图片的 id 与摘要，POST /images/:id/review 的 :id 即取自这里',
  })
  @ApiOkResponse({
    description: '待审核图片分页列表',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/PendingImageDto' },
        },
        total: { type: 'number', example: 3 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: 403, description: '权限不足：需要 MODERATOR 及以上角色' })
  async findPending(@Query() query: PaginationQueryDto) {
    return this.imageService.findPending(query.page ?? 1, query.limit ?? 20);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: '分页获取图片列表',
    description: '公开接口，默认只返回已过审图片；审核员及以上可通过 status 筛选任意审核状态',
  })
  @ApiOkResponse({
    description: '图片分页列表',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/ImageListItemDto' } },
        total: { type: 'number', example: 120 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
        totalPages: { type: 'number', example: 6 },
      },
    },
  })
  @ApiResponse({ status: 403, description: '非审核员尝试按审核状态筛选' })
  async findAll(@Query() query: ListImagesQueryDto, @Req() req: any) {
    return this.imageService.findAll(query.page ?? 1, query.limit ?? 20, query.status, req.user);
  }

  @Get(':id/thumbnail')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取缩略图流', description: '已过审图片游客可预览；未过审图片仅审核员及以上或上传者本人可查看' })
  @ApiResponse({ status: 200, description: '返回图片二进制流（PNG/WebP 原图产出 WebP 缩略图，其余格式产出 JPEG）', content: { 'image/webp': { schema: { type: 'string', format: 'binary' } }, 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 403, description: '无权查看未通过审核的图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  @ApiResponse({ status: 500, description: '原图文件丢失或完整性校验失败，无法生成缩略图' })
  async getThumbnail(@Param('id', ParseUUIDPipe) id: string, @Req() req: any, @Res() res: Response) {
    const { buffer, mimeType } = await this.imageService.getThumbnail(id, req.user);
    // private：未过审图片只对审核员/本人开放，不能被共享缓存留存；Vary 保证同一 URL 的游客与登录态不串缓存
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=86400', Vary: 'Authorization' });
    res.send(buffer);
  }

  @Get(':id/sign')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '生成带签名的限时下载链接', description: '无需登录：已过审图片对所有人开放，游客也能拿到链接；未过审图片即使拿到链接，下载时仍会被拒绝（审核员及以上与上传者本人除外）。downloadUrl 是含协议与主机名的绝对地址，有效期等于 expiresInMs' })
  @ApiOkResponse({
    description: '返回下载链接及过期时间',
    schema: {
      type: 'object',
      properties: {
        downloadUrl: { type: 'string', example: '/api/images/550e8400-e29b-41d4-a716-446655440000/download?signature=abc&expires=1767225600000' },
        expiresInMs: { type: 'number', example: 86400000 },
      },
    },
  })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async generateSignedUrl(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const signedUrl = await this.imageService.generateSignedUrl(id, baseUrl);
    return {
      downloadUrl: signedUrl,
      expiresInMs: this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 60 * 1000),
    };
  }

  @Get(':id/download')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '下载原图 (需有效签名)', description: '已过审图片游客持签名链接即可下载；未过审图片仅审核员及以上或上传者本人可下载，其余返回 403' })
  @ApiResponse({ status: 200, description: '返回原图二进制流，Content-Type 为原图实际的 MIME，带 Content-Disposition: attachment 与 X-Content-MD5（供前端校验完整性）', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } }, 'image/webp': { schema: { type: 'string', format: 'binary' } }, 'image/gif': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 400, description: '签名无效或已过期' })
  @ApiResponse({ status: 403, description: '图片已被拒绝或无权下载未过审图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  @ApiResponse({ status: 500, description: '原图文件丢失或完整性校验失败' })
  async downloadOriginal(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DownloadImageQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename, md5 } = await this.imageService.getOriginal(id, query.signature, query.expires, req.user);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      // 浏览器里前端通过 fetch 拿到 blob 后，用它与 GET /images/:id 的 md5 对比即可判断文件是否完整
      'X-Content-MD5': md5,
    });
    res.send(buffer);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取图片详情', description: '已过审图片游客可访问；未过审图片仅审核员及以上或上传者本人可访问。响应已脱敏，不含 path / uploaderIp / reviewedBy；md5 保留，供前端校验下载到的原图是否完整' })
  @ApiOkResponse({ type: ImageResponseDto, description: '返回图片详细信息' })
  @ApiResponse({ status: 403, description: '无权查看未通过审核的图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return await this.imageService.findOne(id, req.user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除图片 (本人或上级角色)' })
  @ApiOkResponse({ description: '删除成功', schema: { type: 'object', properties: { message: { type: 'string', example: '图片及缓存已彻底删除' } } } })
  @ApiResponse({ status: 403, description: '无权删除此图片' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.imageService.remove(id, req.user);
    return { message: '图片及缓存已彻底删除' };
  }
}
