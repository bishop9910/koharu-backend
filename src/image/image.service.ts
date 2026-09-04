// src/image/image.service.ts
import { 
  Injectable, Logger, NotFoundException, BadRequestException, 
  ForbiddenException, InternalServerErrorException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { Image } from '../entities/image.entity.js';
import { FileService } from '../common/file/file.service.js';
import { calculateMD5 } from '../common/utils/hash.util.js'; // 👈 确保引入
import { ImageStatus } from '../enums/image-status.enum.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly imageRoot: string;
  private readonly cacheRoot: string;
  private readonly cacheTimeMs: number; 
  private readonly signatureSecret: string;

  constructor(
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
    private fileService: FileService,
    private configService: ConfigService,
  ) {
    this.imageRoot = path.resolve(process.cwd(), this.configService.get<string>('server.image_lib.path', './images'));
    this.cacheRoot = path.resolve(process.cwd(), this.configService.get<string>('server.image_lib.cache_path', './image_cache'));
    this.cacheTimeMs = this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 1000);
    this.signatureSecret = this.configService.get<string>('server.token.key', 'default_secret');
  }

  async upload(file: Express.Multer.File, userId?: string): Promise<Image> {
    const originalPath = await this.fileService.saveFile(file, 'images');
    const metadata = await sharp(file.buffer).metadata();
    const thumbnailPath = await this.generateThumbnail(file.buffer, path.basename(originalPath), file.mimetype);
    const image_md5 = calculateMD5(file.buffer);

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

    this.logger.log(`用户 ${userId} 上传图片，等待审核: ${image.id}, MD5: ${image_md5}`);
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

   private async generateThumbnail(
    imageBuffer: Buffer, 
    originalFilename: string, 
    originalMimeType: string
  ): Promise<string> {
    const ext = path.extname(originalFilename).toLowerCase();
    const nameWithoutExt = path.basename(originalFilename, ext);
    
    let processor = sharp(imageBuffer).resize({ 
      width: 800,
      withoutEnlargement: true
    });

    let thumbExt = ext;

    if (ext === '.png') {
      // PNG 转为 WebP
      thumbExt = '.webp';
      processor = processor.webp({ quality: 80 });
    } else if (ext === '.webp') {
      processor = processor.webp({ quality: 80 });
    } else {
      // JPEG / JPG
      thumbExt = '.jpg';
      processor = processor.jpeg({ quality: 80 });
    }

    const thumbFilename = `thumb_${nameWithoutExt}${thumbExt}`;
    const thumbRelativePath = `/image_cache/${thumbFilename}`;
    const thumbAbsolutePath = path.join(this.cacheRoot, thumbFilename);

    await fs.mkdir(this.cacheRoot, { recursive: true });
    
    await processor.toFile(thumbAbsolutePath);

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
      this.logger.warn(`缩略图缓存丢失，触发自愈逻辑，准备从原图重新生成: ${image.id}`);
      
      const originalBuffer = await this.fileService.readFile(image.path);
      
      const currentMd5 = calculateMD5(originalBuffer);
      if (currentMd5 !== image.md5) {
        this.logger.error(`原图文件完整性校验失败！数据库MD5: ${image.md5}, 实际文件MD5: ${currentMd5}, 图片ID: ${image.id}`);
        throw new InternalServerErrorException('原图文件已损坏或被篡改，无法生成缩略图，请联系管理员');
      }

      await this.generateThumbnail(originalBuffer, path.basename(image.path), image.mimeType);
      this.logger.log(`缩略图自愈生成成功: ${image.id}`);
    }

    return {
      buffer: await this.fileService.readFile(image.thumbnailPath),
      mimeType: 'image/jpeg',
    };
  }

  generateSignedUrl(imageId: string, baseUrl: string): string {
    const now = Date.now();
    const expires = now + this.cacheTimeMs; 
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

  async getOriginal(imageId: string, signature: string, expires: string): Promise<{ buffer: Buffer; mimeType: string; filename: string; }> {
    const expiresMs = parseInt(expires, 10);
    const now = Date.now();

    if (now > expiresMs) throw new BadRequestException('下载链接已过期，请重新获取');

    const expectedSignature = this.createSignature(imageId, expiresMs);
    if (signature !== expectedSignature) throw new BadRequestException('无效的签名');

    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (image.status === ImageStatus.REJECTED) {
       throw new ForbiddenException('该图片已被拒绝，无法下载');
    }

    const originalBuffer = await this.fileService.readFile(image.path);

    const currentMd5 = calculateMD5(originalBuffer);
    if (currentMd5 !== image.md5) {
      this.logger.error(`下载前原图文件完整性校验失败！数据库MD5: ${image.md5}, 实际文件MD5: ${currentMd5}, 图片ID: ${image.id}`);
      throw new InternalServerErrorException('原图文件已损坏或被篡改，下载已中止，请联系管理员');
    }

    this.logger.log(`用户成功下载图片 (MD5校验通过): ${image.id}`);

    return {
      buffer: originalBuffer,
      mimeType: image.mimeType,
      filename: image.filename,
    };
  }

  async remove(imageId: string, currentUser: any): Promise<void> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    const isAdminOrMod = currentUser?.role === Role.ADMIN || currentUser?.role === Role.MODERATOR;
    const isOwner = currentUser?.id === image.userId;

    if (!isAdminOrMod && !isOwner) {
      this.logger.warn(`用户 ${currentUser?.id} 尝试越权删除图片 ${imageId}`);
      throw new ForbiddenException('无权删除此图片');
    }

    await this.fileService.deleteFile(image.path);
    if (image.thumbnailPath) {
      await this.fileService.deleteFile(image.thumbnailPath);
    }
    await this.imageRepository.remove(image);
    this.logger.log(`图片 ${imageId} 已被用户 ${currentUser?.id} 删除`);
  }

  async findOne(imageId: string, currentUser?: any): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException(`图片 ID ${imageId} 不存在`);

    if (image.status !== ImageStatus.APPROVED) {
      const isAdminOrMod = currentUser?.role === Role.ADMIN || currentUser?.role === Role.MODERATOR;
      const isOwner = currentUser?.id === image.userId;
      if (!isAdminOrMod && !isOwner) {
        throw new ForbiddenException('无权查看未通过审核的图片');
      }
    }
    return image;
  }
}