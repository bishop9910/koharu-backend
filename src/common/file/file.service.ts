// src/common/file/file.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { fileTypeFromFile } from 'file-type';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly uploadRoot: string;

  constructor(private configService: ConfigService) {
    this.uploadRoot = path.resolve(
      process.cwd(),
      this.configService.get<string>('upload.dir', './uploads'),
    );
    this.logger.log(`文件上传根目录已初始化: ${this.uploadRoot}`);
  }

  private resolveSafePath(relativePath: string): string {
    if (relativePath.includes('\0')) {
      this.logger.warn(`拦截非法路径(包含空字节): ${relativePath}`);
      throw new BadRequestException('非法路径：包含空字节');
    }
    const cleanPath = relativePath.replace(/^\/+/, '');
    const absolutePath = path.resolve(this.uploadRoot, cleanPath);

    if (!absolutePath.startsWith(this.uploadRoot + path.sep) && absolutePath !== this.uploadRoot) {
      this.logger.warn(`拦截路径遍历攻击尝试: ${relativePath} -> ${absolutePath}`);
      throw new BadRequestException('非法路径：禁止访问上传目录之外的文件');
    }
    return absolutePath;
  }

  private async assertIsFile(absolutePath: string): Promise<void> {
    const stat = await fs.stat(absolutePath);
    if (stat.isDirectory()) {
      this.logger.warn(`拦截对目录的非法操作: ${absolutePath}`);
      throw new BadRequestException('非法操作：目标是目录而非文件');
    }
  }

  async saveFile(
    file: Express.Multer.File,
    subDir: string = 'uploads',
  ): Promise<string> {
    const maxSize = this.configService.get<number>('upload.maxSize', 20 * 1024 * 1024);
    if (file.size > maxSize) {
      this.logger.warn(`文件上传失败(过大): ${file.originalname}, 大小: ${file.size}`);
      throw new BadRequestException(`文件过大: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    const allowedTypes = this.configService.get<string[]>('upload.allowedTypes', []);
    if (!allowedTypes.includes(file.mimetype)) {
      this.logger.warn(`文件上传失败(类型不允许): ${file.originalname}, MIME: ${file.mimetype}`);
      throw new BadRequestException(`不允许的文件类型: ${file.mimetype}`);
    }

    const originalExt = path.extname(file.originalname).toLowerCase();
    const safeFilename = `${randomUUID()}${originalExt}`;
    const relativePath = path.join(subDir, safeFilename).replace(/\\/g, '/');
    const absolutePath = this.resolveSafePath(relativePath);

    try {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, file.buffer);
    } catch (error: any) {
      this.logger.error(`文件写入磁盘失败: ${absolutePath}`, error.stack);
      throw new BadRequestException('文件保存失败，请检查服务器磁盘权限');
    }

    // 二次校验 magic bytes
    const fileType = await fileTypeFromFile(absolutePath);
    if (!fileType || !allowedTypes.includes(fileType.mime)) {
      this.logger.warn(`安全拦截(Magic Bytes不符): 声明=${file.mimetype}, 实际=${fileType?.mime}, 文件=${absolutePath}`);
      await fs.unlink(absolutePath).catch(() => {});
      throw new BadRequestException('文件内容类型与声明不符，可能存在安全风险');
    }

    this.logger.log(`文件保存成功: ${relativePath} (${(file.size / 1024).toFixed(2)} KB)`);
    return `/${relativePath}`;
  }

  async deleteFile(relativePath: string): Promise<boolean> {
    if (!relativePath) return false;
    const absolutePath = this.resolveSafePath(relativePath);
    try {
      await this.assertIsFile(absolutePath);
      await fs.unlink(absolutePath);
      this.logger.log(`文件删除成功: ${relativePath}`);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.debug(`尝试删除不存在的文件，已跳过: ${relativePath}`);
        return false;
      }
      if (error instanceof BadRequestException) throw error;
      
      this.logger.error(`文件删除失败: ${relativePath}`, error.stack);
      throw error;
    }
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const absolutePath = this.resolveSafePath(relativePath);
    await this.assertIsFile(absolutePath);
    try {
      return await fs.readFile(absolutePath);
    } catch (error: any) {
      this.logger.error(`文件读取失败: ${relativePath}`, error.stack);
      throw error;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    if (!relativePath) return false;
    try {
      const absolutePath = this.resolveSafePath(relativePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}