// src/image/image.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, IsNull } from 'typeorm';
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
import { isStaff, canManageTarget } from '../common/utils/role.util.js';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly cacheRoot: string;
  private readonly cacheTimeMs: number;
  private readonly signatureSecret: string;

  constructor(
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
    private fileService: FileService,
    private configService: ConfigService,
  ) {
    this.cacheRoot = path.resolve(process.cwd(), this.configService.get<string>('server.image_lib.cache_path', './image_cache'));
    this.cacheTimeMs = this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 60 * 1000);
    this.signatureSecret = this.configService.get<string>('server.token.key', 'default_secret');
  }

  async upload(file: Express.Multer.File, currentUser?: any, ip?: string): Promise<Image> {
    const isExempt = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

    if (!isExempt) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayCount = await this.imageRepository.count({
        where: {
          uploaderIp: ip ? ip : IsNull(),
          createdAt: MoreThanOrEqual(startOfToday),
        },
      });
      if (todayCount >= 500) {
        throw new HttpException('今日上传数量已达上限 (500 张)', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const processed = await this.processFile(file);

    const image = this.imageRepository.create({
      filename: file.originalname,
      path: processed.originalPath,
      thumbnailPath: processed.thumbnailPath,
      mimeType: processed.mimeType,
      size: processed.size,
      width: processed.width,
      height: processed.height,
      userId: currentUser?.id ?? null,
      md5: processed.md5,
      status: ImageStatus.PENDING,
      uploaderIp: ip ?? null,
    });

    this.logger.log(`用户 ${currentUser?.id} 上传图片，等待审核: ${image.id}, MD5: ${processed.md5}`);
    return await this.imageRepository.save(image);
  }

  async modify(imageId: string, file: Express.Multer.File, currentUser: any): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (image.userId !== currentUser.id) {
      throw new ForbiddenException('只能修改自己的图片');
    }

    if (image.status !== ImageStatus.APPROVED && image.status !== ImageStatus.REJECTED) {
      throw new BadRequestException('仅已过审或被拒绝的图片可以修改');
    }

    if (image.editCount >= 1) {
      throw new BadRequestException('每张图片仅可修改一次');
    }

    const processed = await this.processFile(file);

    if (image.path) {
      await this.fileService.deleteFile(image.path).catch(() => {});
    }
    if (image.thumbnailPath) {
      await this.fileService.deleteFile(image.thumbnailPath).catch(() => {});
    }

    image.filename = file.originalname;
    image.path = processed.originalPath;
    image.thumbnailPath = processed.thumbnailPath;
    image.mimeType = processed.mimeType;
    image.size = processed.size;
    image.width = processed.width;
    image.height = processed.height;
    image.md5 = processed.md5;
    image.status = ImageStatus.PENDING;
    image.rejectReason = null;
    image.reviewedBy = null;
    image.editCount = image.editCount + 1;

    this.logger.log(`用户 ${currentUser.id} 修改图片 ${imageId}，等待重新审核`);
    return await this.imageRepository.save(image);
  }

  async reviewImage(imageId: string, status: ImageStatus, reviewerId: string, reason?: string): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (status === ImageStatus.PENDING) {
      throw new BadRequestException('审核状态只能是 approved 或 rejected');
    }

    if (status === ImageStatus.REJECTED && !reason) {
      throw new BadRequestException('拒绝图片时必须提供原因');
    }

    image.status = status;
    image.reviewedBy = reviewerId;
    image.rejectReason = status === ImageStatus.REJECTED ? (reason ?? null) : null;

    this.logger.log(`审核员 ${reviewerId} 将图片 ${imageId} 状态更新为: ${status}`);
    return await this.imageRepository.save(image);
  }

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [images, total] = await this.imageRepository.findAndCount({
      where: { status: ImageStatus.APPROVED },
      select: {
        id: true,
        filename: true,
        thumbnailPath: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        userId: true,
        createdAt: true,
      },
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      data: images,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findMine(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [images, total] = await this.imageRepository.findAndCount({
      where: { userId },
      select: {
        id: true,
        filename: true,
        thumbnailPath: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        status: true,
        rejectReason: true,
        createdAt: true,
      },
      relations: {
        albums: true,
      },
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    const data = images.map((img: any) => {
      const { albums, ...rest } = img;
      return {
        ...rest,
        archived: (albums?.length ?? 0) > 0,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async processFile(file: Express.Multer.File) {
    const originalPath = await this.fileService.saveFile(file, 'images');
    const metadata = await sharp(file.buffer).metadata();
    const thumbnailPath = await this.generateThumbnail(file.buffer, path.basename(originalPath), file.mimetype);
    const md5 = calculateMD5(file.buffer);

    return {
      originalPath,
      thumbnailPath,
      md5,
      size: file.size,
      width: metadata.width,
      height: metadata.height,
      mimeType: file.mimetype,
    };
  }

  private async generateThumbnail(
    imageBuffer: Buffer,
    originalFilename: string,
    originalMimeType: string,
  ): Promise<string> {
    const ext = path.extname(originalFilename).toLowerCase();
    const nameWithoutExt = path.basename(originalFilename, ext);

    let processor = sharp(imageBuffer).resize({
      width: 800,
      withoutEnlargement: true,
    });

    let thumbExt = ext;

    if (ext === '.png') {
      thumbExt = '.webp';
      processor = processor.webp({ quality: 80 });
    } else if (ext === '.webp') {
      processor = processor.webp({ quality: 80 });
    } else {
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

    if (image.status !== ImageStatus.APPROVED && !isStaff(currentUser?.role)) {
      throw new ForbiddenException('无权查看未通过审核的图片');
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
      mimeType: this.mimeFromPath(image.thumbnailPath),
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

  async getOriginal(
    imageId: string,
    signature: string,
    expires: string,
    currentUser?: any,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
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

    if (image.status !== ImageStatus.APPROVED && !isStaff(currentUser?.role)) {
      throw new ForbiddenException('无权下载未通过审核的图片');
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
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
      relations: {
        user: true,
      },
    });
    if (!image) throw new NotFoundException('图片不存在');

    const isOwner = currentUser?.id === image.userId;
    const ownerRole = image.user?.role;

    if (!isOwner) {
      if (!isStaff(currentUser?.role)) {
        this.logger.warn(`用户 ${currentUser?.id} 尝试越权删除图片 ${imageId}`);
        throw new ForbiddenException('无权删除此图片');
      }
      if (ownerRole && !canManageTarget(currentUser?.role, ownerRole)) {
        this.logger.warn(`用户 ${currentUser?.id} 尝试越权删除图片 ${imageId}`);
        throw new ForbiddenException('无权删除此图片');
      }
    }

    await this.fileService.deleteFile(image.path);
    if (image.thumbnailPath) {
      await this.fileService.deleteFile(image.thumbnailPath);
    }
    await this.imageRepository.remove(image);
    this.logger.log(`图片 ${imageId} 已被用户 ${currentUser?.id} 删除`);
  }

  async removeAllByUser(userId: string): Promise<void> {
    const images = await this.imageRepository.find({ where: { userId } });
    for (const image of images) {
      await this.fileService.deleteFile(image.path).catch(() => {});
      if (image.thumbnailPath) {
        await this.fileService.deleteFile(image.thumbnailPath).catch(() => {});
      }
      await this.imageRepository.remove(image);
    }
    this.logger.log(`已清理用户 ${userId} 的全部图片 (${images.length} 张)`);
  }

  async findOne(imageId: string, currentUser?: any): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException(`图片 ID ${imageId} 不存在`);

    if (image.status !== ImageStatus.APPROVED && !isStaff(currentUser?.role)) {
      throw new ForbiddenException('无权查看未通过审核的图片');
    }
    return image;
  }

  private mimeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }
}
