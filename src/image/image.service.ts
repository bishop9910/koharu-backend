// src/image/image.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { Image } from '../entities/image.entity.js';
import { FileService } from '../common/file/file.service.js';
import { calculateMD5 } from '../common/utils/hash.util.js';
import { mimeFromPath } from '../common/utils/mime.util.js';
import { ImageStatus } from '../enums/image-status.enum.js';
import { Role } from '../enums/role.enum.js';
import { isStaff, canManageTarget } from '../common/utils/role.util.js';
import { ImageResponseDto } from './dto/image-response.dto.js';
import { ImageListItemDto } from './dto/image-list-item.dto.js';
import { API_PREFIX } from '../common/constants.js';
import { LibraryCryptoService } from '../library/library-crypto.service.js';
import { ReviewExemptionService } from '../review/review-exemption.service.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  /** 缩略图缓存目录的「数据库相对路径」，形如 /image_cache。写入与读取都以它为前缀。 */
  private readonly cacheDir: string;
  private readonly cacheTimeMs: number;
  private readonly signatureSecret: string;

  constructor(
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
    private fileService: FileService,
    private libraryCrypto: LibraryCryptoService,
    private reviewExemption: ReviewExemptionService,
    private configService: ConfigService,
  ) {
    this.cacheDir = this.resolveCacheDir();
    this.cacheTimeMs = this.configService.get<number>('server.image_lib.cache_time', 24 * 60 * 60 * 1000);
    this.signatureSecret = this.configService.get<string>('server.token.key', 'default_secret');
  }

  /**
   * 计算缩略图缓存目录的数据库相对路径（如 /image_cache）。
   *
   * FileService 统一以 upload.dir 为根解析相对路径，所以缩略图必须落在上传目录之内，
   * 否则会出现「文件写在这里、读取却去那里找」的 ENOENT（缩略图接口永久 500）。
   * 历史配置 server.image_lib.cache_path: "./image_cache" 就在上传目录之外，
   * 此时回退到 <upload.dir>/image_cache 并打警告，保证写入位置与读取位置一致。
   */
  private resolveCacheDir(): string {
    const uploadRoot = this.fileService.getUploadRoot();
    const fallback = path.join(uploadRoot, 'image_cache');
    const configured = path.resolve(
      process.cwd(),
      this.configService.get<string>('server.image_lib.cache_path', fallback),
    );

    const relative = path.relative(uploadRoot, configured).split(path.sep).join('/');
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      this.logger.warn(
        `配置项 server.image_lib.cache_path (${configured}) 不在上传目录 ${uploadRoot} 之内，` +
          `已回退为 ${fallback}。请把 cache_path 指向上传目录下的子目录（推荐 ./uploads/image_cache）。`,
      );
      return '/image_cache';
    }

    return `/${relative}`;
  }

  async upload(file: Express.Multer.File, currentUser?: any, ip?: string): Promise<ImageResponseDto> {
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

    const saved = await this.imageRepository.save(image);
    this.logger.log(`用户 ${currentUser?.id} 上传图片，等待审核: ${saved.id}, MD5: ${processed.md5}`);
    return this.toDetailDto(saved);
  }

  async modify(imageId: string, file: Express.Multer.File, currentUser: any): Promise<ImageResponseDto> {
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
    return this.toDetailDto(await this.imageRepository.save(image));
  }

  async reviewImage(
    imageId: string,
    status: ImageStatus,
    currentUser: AuthenticatedUser,
    reason?: string,
  ): Promise<ImageResponseDto> {
    const reviewerId = currentUser.id;
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (status === ImageStatus.PENDING) {
      throw new BadRequestException('审核状态只能是 approved 或 rejected');
    }

    if (status === ImageStatus.REJECTED && !reason) {
      throw new BadRequestException('拒绝图片时必须提供原因');
    }

    if (image.status === status) {
      throw new ConflictException(`该图片已经是 ${status} 状态，无需重复审核`);
    }

    // 审核是「他人复核」，默认不允许审核员给自己上传的图片下结论；
    // 例外：管理员及以上角色天然豁免，被加入自审赦免名单的审核员同样放行。
    if (image.userId === reviewerId && !(await this.reviewExemption.isSelfReviewExempt(reviewerId, currentUser.role))) {
      throw new ForbiddenException('不能审核自己上传的图片');
    }

    // 以「读到的旧状态」为并发条件：两名审核员同时审核同一张图片时，
    // 后提交的一方会更新 0 行并收到 409，而不是覆盖前一个人的结论。
    const result = await this.imageRepository.update(
      { id: imageId, status: image.status },
      {
        status,
        reviewedBy: reviewerId,
        rejectReason: status === ImageStatus.REJECTED ? (reason ?? null) : null,
      },
    );

    if (!result.affected) {
      throw new ConflictException('图片审核状态已被其他审核员变更，请刷新后重试');
    }

    this.logger.log(`审核员 ${reviewerId} 将图片 ${imageId} 状态更新为: ${status}`);
    const updated = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!updated) throw new NotFoundException('图片不存在');
    return this.toDetailDto(updated);
  }

  async findAll(page: number, limit: number, status?: ImageStatus, currentUser?: any) {
    const skip = (page - 1) * limit;

    if (status && !isStaff(currentUser?.role)) {
      throw new ForbiddenException('仅审核员及以上角色可按审核状态筛选图片');
    }

    const [images, total] = await this.imageRepository.findAndCount({
      where: { status: status ?? ImageStatus.APPROVED },
      select: {
        id: true,
        filename: true,
        thumbnailPath: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        userId: true,
        status: true,
        createdAt: true,
      },
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      data: images.map((image) => this.toListImage(image)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 待审核队列：审核界面靠它拿到 id 再去调 POST /images/:id/review。
   * 按上传时间正序（先来先审），并带上上传者用户名，省去审核员再查一次用户。
   */
  async findPending(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [images, total] = await this.imageRepository.findAndCount({
      where: { status: ImageStatus.PENDING },
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
      relations: {
        user: true,
      },
      skip,
      take: limit,
      order: {
        createdAt: 'ASC',
      },
    });

    return {
      data: images.map((image: any) => ({
        id: image.id,
        filename: image.filename,
        thumbnailPath: image.thumbnailPath,
        thumbnailUrl: `/${API_PREFIX}/images/${image.id}/thumbnail`,
        mimeType: image.mimeType,
        size: image.size,
        width: image.width,
        height: image.height,
        userId: image.userId,
        username: image.user?.username ?? null,
        status: ImageStatus.PENDING,
        createdAt: image.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findMine(userId: string, page: number, limit: number, status?: ImageStatus) {
    const skip = (page - 1) * limit;

    const [images, total] = await this.imageRepository.findAndCount({
      where: { userId, ...(status ? { status } : {}) },
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
        userId: true,
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
        thumbnailUrl: `/${API_PREFIX}/images/${img.id}/thumbnail`,
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
    // FileService 负责大小/MIME/magic bytes 校验与随机命名（这些都要求明文），
    // 校验通过后立刻原地加密，磁盘上的最终形态始终是密文
    await this.sealFile(originalPath);
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

  /**
   * 原地把磁盘上的明文文件加密成密文。
   *
   * 已经有 KHR1 头的文件直接跳过（重复调用安全）；预览密文格式见 LibraryCryptoService。
   * 用原子写，避免轮转/补偿加密期间读到半个文件。
   */
  private async sealFile(relativePath: string): Promise<void> {
    const stored = await this.fileService.readFile(relativePath);
    if (this.libraryCrypto.isEncrypted(stored)) return;
    await this.fileService.writeFileAtomically(relativePath, this.libraryCrypto.encrypt(stored));
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
    const thumbRelativePath = `${this.cacheDir}/${thumbFilename}`;

    // 统一走 FileService 写入，保证「写到哪儿」和「从哪儿读」是同一个根；
    // 缩略图同样是图片内容，和原图一样用图库密钥加密后落盘
    await this.fileService.writeBuffer(thumbRelativePath, this.libraryCrypto.encrypt(await processor.toBuffer()));

    return thumbRelativePath;
  }

  async getThumbnail(imageId: string, currentUser?: any): Promise<{ buffer: Buffer; mimeType: string }> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (!this.canPreview(image, currentUser)) {
      throw new ForbiddenException('无权查看未通过审核的图片');
    }

    let thumbRelativePath = image.thumbnailPath;

    const thumbExists = await this.fileService.exists(thumbRelativePath);
    if (!thumbExists) {
      this.logger.warn(`缩略图缓存丢失，触发自愈逻辑，准备从原图重新生成: ${image.id}`);

      let originalBuffer: Buffer;
      try {
        originalBuffer = this.libraryCrypto.decrypt(await this.fileService.readFile(image.path));
      } catch (error: any) {
        this.logger.error(
          `原图文件丢失，无法自愈缩略图！图片ID: ${image.id}, 原图路径: ${image.path}, 原因: ${error?.message}`,
        );
        throw new InternalServerErrorException('原图文件已丢失，无法生成缩略图，请联系管理员');
      }

      const currentMd5 = calculateMD5(originalBuffer);
      if (currentMd5 !== image.md5) {
        this.logger.error(`原图文件完整性校验失败！数据库MD5: ${image.md5}, 实际文件MD5: ${currentMd5}, 图片ID: ${image.id}`);
        throw new InternalServerErrorException('原图文件已损坏或被篡改，无法生成缩略图，请联系管理员');
      }

      // 用「本次刚生成」的路径去读取，避免数据库里的历史路径与生成路径不一致而再次 ENOENT
      const regeneratedPath = await this.generateThumbnail(originalBuffer, path.basename(image.path), image.mimeType);
      if (regeneratedPath !== thumbRelativePath) {
        this.logger.warn(`缩略图路径已修正: ${thumbRelativePath} -> ${regeneratedPath} (图片ID: ${image.id})`);
        await this.imageRepository.update(image.id, { thumbnailPath: regeneratedPath });
      }
      thumbRelativePath = regeneratedPath;
      this.logger.log(`缩略图自愈生成成功: ${image.id}`);
    }

    return {
      buffer: this.libraryCrypto.decrypt(await this.fileService.readFile(thumbRelativePath)),
      mimeType: mimeFromPath(thumbRelativePath),
    };
  }

  async generateSignedUrl(imageId: string, baseUrl: string, currentUser?: any): Promise<string> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
      select: { id: true, status: true, userId: true },
    });
    if (!image) throw new NotFoundException(`图片 ID ${imageId} 不存在`);
    // 与下载保持同一判据：拿不到签名，就不应该存在「先给链接、下载时才 403」的落差
    if (!this.canPreview(image, currentUser)) {
      throw new ForbiddenException(image.status === ImageStatus.REJECTED ? '该图片已被拒绝，无法下载' : '无权下载未通过审核的图片');
    }

    const now = Date.now();
    const expires = now + this.cacheTimeMs;
    const signature = this.createSignature(imageId, expires);

    const url = new URL(`/${API_PREFIX}/images/${imageId}/download`, baseUrl);
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
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string; md5: string }> {
    const expiresMs = parseInt(expires, 10);
    const now = Date.now();

    if (now > expiresMs) throw new BadRequestException('下载链接已过期，请重新获取');

    const expectedSignature = this.createSignature(imageId, expiresMs);
    if (signature !== expectedSignature) throw new BadRequestException('无效的签名');

    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException('图片不存在');

    if (!this.canPreview(image, currentUser)) {
      throw new ForbiddenException(
        image.status === ImageStatus.REJECTED ? '该图片已被拒绝，无法下载' : '无权下载未通过审核的图片',
      );
    }

    const originalBuffer = this.libraryCrypto.decrypt(await this.fileService.readFile(image.path));

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
      md5: image.md5,
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

  async findOne(imageId: string, currentUser?: any): Promise<ImageResponseDto> {
    const image = await this.imageRepository.findOne({ where: { id: imageId } });
    if (!image) throw new NotFoundException(`图片 ID ${imageId} 不存在`);

    if (!this.canPreview(image, currentUser)) {
      throw new ForbiddenException('无权查看未通过审核的图片');
    }

    return this.toDetailDto(image);
  }

  /**
   * 已过审图片人人可见；未过审图片仅审核员及以上与上传者本人可见。
   * 上传者本人必须能看到自己待审/被拒的图片，否则改稿时无从对照。
   */
  private canPreview(image: Image, currentUser?: any): boolean {
    if (image.status === ImageStatus.APPROVED) return true;
    if (isStaff(currentUser?.role)) return true;
    return !!currentUser?.id && image.userId === currentUser.id;
  }

  /** 列表项：在查询投影之上补一个可直接访问的缩略图地址，与上传/修改接口保持一致。 */
  private toListImage(image: any): ImageListItemDto {
    return {
      ...image,
      thumbnailUrl: `/${API_PREFIX}/images/${image.id}/thumbnail`,
    };
  }

  private toDetailDto(image: Image): ImageResponseDto {
    return {
      id: image.id,
      filename: image.filename,
      thumbnailPath: image.thumbnailPath,
      thumbnailUrl: `/${API_PREFIX}/images/${image.id}/thumbnail`,
      mimeType: image.mimeType,
      size: image.size,
      md5: image.md5,
      width: image.width,
      height: image.height,
      userId: image.userId,
      status: image.status,
      rejectReason: image.rejectReason,
      editCount: image.editCount,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    };
  }
}
