// src/image/image.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { Image } from '../entities/image.entity.js';
import { FileService } from '../common/file/file.service.js';
import { calculateMD5 } from '../common/utils/hash.util.js';
import { ImageStatus } from '../enums/image-status.enum.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly imageRoot: string;
  private readonly cacheRoot: string;
  private readonly cacheTimeMs: number; // 毫秒
  private readonly signatureSecret: string;
  private readonly signExpireIn: number;

  constructor(
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
    private fileService: FileService,
    private configService: ConfigService,
  ) {
    // 👇 适配 server.image_lib 配置
    this.imageRoot = path.resolve(
      process.cwd(),
      this.configService.get<string>('server.image_lib.path', './images'),
    );
    this.cacheRoot = path.resolve(
      process.cwd(),
      this.configService.get<string>('server.image_lib.cache_path', './image_cache'),
    );
    this.cacheTimeMs = this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 1000);
    this.signExpireIn = this.configService.get<number>('server.image_lib.signature.expire_in', 24 * 60 * 1000);
    
    // 使用 server.token.key 作为签名密钥，保持系统密钥统一
    this.signatureSecret = this.configService.get<string>('server.token.key', 'default_secret');
  }

  async upload(file: Express.Multer.File, userId?: string): Promise<Image> {
    // 1. 保存原图到 ./images
    const originalPath = await this.fileService.saveFile(file, 'images');

    // 2. 获取元数据
    const metadata = await sharp(file.buffer).metadata();

    // 3. 生成缩略图并放入 ./image_cache
    const thumbnailPath = await this.generateThumbnail(file.buffer, path.basename(originalPath));

    const image_md5 = calculateMD5(file.buffer);
    // 4. 入库
    const image = this.imageRepository.create({
      filename: file.originalname,
      path: originalPath,
      thumbnailPath,
      mimeType: file.mimetype,
      size: file.size,
      width: metadata.width,
      height: metadata.height,
      userId,
      md5: image_md5,
      status: ImageStatus.PENDING,
    });

    this.logger.log(`用户 ${userId} 上传图片，等待审核: ${image.id}`);
    return await this.imageRepository.save(image);
  }

  async reviewImage(imageId: string, status: ImageStatus, reviewerId: string, reason?: string): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (status === ImageStatus.REJECTED && !reason) {
      throw new BadRequestException('拒绝图片时必须提供原因');
    }

    image.status = status;
    image.reviewedBy = reviewerId;
    image.rejectReason = reason || "";
    
    this.logger.log(`审核员 ${reviewerId} 将图片 ${imageId} 状态更新为: ${status}`);
    return await this.imageRepository.save(image);
  }


  private async generateThumbnail(imageBuffer: Buffer, originalFilename: string): Promise<string> {
    const thumbFilename = `thumb_${originalFilename}`;
    const thumbRelativePath = `/image_cache/${thumbFilename}`;
    const thumbAbsolutePath = path.join(this.cacheRoot, thumbFilename);

    await fs.mkdir(this.cacheRoot, { recursive: true });

    // 生成 400x400 的居中裁剪缩略图，质量 80
    await sharp(imageBuffer)
      .resize(400, 400, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toFile(thumbAbsolutePath);

    return thumbRelativePath;
  }

  async getThumbnail(imageId: string, currentUser?: any): Promise<{ buffer: Buffer; mimeType: string }> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (image.status !== ImageStatus.APPROVED) {
      const isAdminOrMod = currentUser?.role === Role.ADMIN || currentUser?.role === Role.MODERATOR;
      const isOwner = currentUser?.id === image.userId;

      if (!isAdminOrMod && !isOwner) {
        throw new ForbiddenException('无权查看未通过审核的图片');
      }
    }
    
    const thumbExists = await this.fileService.exists(image.thumbnailPath);
    if (!thumbExists) {
      const originalBuffer = await this.fileService.readFile(image.path);
      await this.generateThumbnail(originalBuffer, path.basename(image.path));
    }

    return {
      buffer: await this.fileService.readFile(image.thumbnailPath),
      mimeType: 'image/jpeg',
    };
  }

  // ==================== 签名与下载逻辑 ====================

  generateSignedUrl(imageId: string, baseUrl: string): string {
    const now = Date.now();
    const expires = now + this.cacheTimeMs; // 👇 使用配置的毫秒级过期时间
    const signature = this.createSignature(imageId, expires);

    const url = new URL(`/images/${imageId}/download`, baseUrl);
    url.searchParams.set('signature', signature);
    url.searchParams.set('expires', expires.toString());

    return url.toString();
  }

  private createSignature(imageId: string, expires: number): string {
    const payload = `${imageId}:${expires}`;
    return crypto.createHmac('sha256', this.signatureSecret).update(payload).digest('hex');
  }

  async getOriginal(imageId: string, signature: string, expires: string): Promise<{
    buffer: Buffer; mimeType: string; filename: string;
  }> {
    const expiresMs = parseInt(expires, 10);
    const now = Date.now();

    // 1. 验证是否过期 (毫秒级对比)
    if (now > expiresMs) {
      throw new BadRequestException('下载链接已过期，请重新获取');
    }

    // 2. 验证签名
    const expectedSignature = this.createSignature(imageId, expiresMs);
    if (signature !== expectedSignature) {
      throw new BadRequestException('无效的签名');
    }

    // 3. 读取原图
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    return {
      buffer: await this.fileService.readFile(image.path),
      mimeType: image.mimeType,
      filename: image.filename,
    };
  }

  async remove(imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    await this.fileService.deleteFile(image.path);
    if (image.thumbnailPath) {
      await this.fileService.deleteFile(image.thumbnailPath);
    }
    await this.imageRepository.remove(image);
  }

    /**
   * 根据 ID 查询图片详情
   */
  async findOne(imageId: string): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) {
      throw new NotFoundException(`图片 ID ${imageId} 不存在`);
    }
    return image;
  }
}