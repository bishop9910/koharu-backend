// src/avatar/avatar.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Avatar } from '../entities/avatar.entity.js';
import { FileService } from '../common/file/file.service.js';

@Injectable()
export class AvatarService {
  // 👇 注入 Logger，自动带上 [AvatarService] 上下文
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @InjectRepository(Avatar)
    private avatarRepository: Repository<Avatar>,
    private fileService: FileService,
  ) {}

  /**
   * 上传或更新头像
   */
  async upsert(userId: string, file: Express.Multer.File): Promise<Avatar> {
    this.logger.log(`开始为用户 ${userId} 处理头像上传`);

    // 1. 查找是否已有头像
    const existingAvatar = await this.avatarRepository.findOne({ where: { userId } });

    // 2. 如果有旧头像，先尝试删除旧文件 (即使失败也记录日志，不阻断新头像上传)
    if (existingAvatar) {
      try {
        await this.fileService.deleteFile(existingAvatar.path);
        this.logger.log(`已清理用户 ${userId} 的旧头像文件`);
      } catch (error: any) {
        this.logger.warn(`清理旧头像文件失败，但将继续上传新头像: ${existingAvatar.path}`, error.stack);
      }
    }

    // 3. 安全保存新文件 (FileService 会自动处理大小、类型、Magic Bytes 校验和 UUID 重命名)
    // subDir 设为 'avatars'，最终路径类似: /avatars/uuid.jpg
    const newPath = await this.fileService.saveFile(file, 'avatars');

    // 4. 保存或更新数据库记录
    if (existingAvatar) {
      existingAvatar.path = newPath;
      const updated = await this.avatarRepository.save(existingAvatar);
      this.logger.log(`用户 ${userId} 头像更新成功: ${newPath}`);
      return updated;
    } else {
      const newAvatar = this.avatarRepository.create({ userId, path: newPath });
      const saved = await this.avatarRepository.save(newAvatar);
      this.logger.log(`用户 ${userId} 头像创建成功: ${newPath}`);
      return saved;
    }
  }

  /**
   * 获取用户头像信息
   */
  async findByUserId(userId: string): Promise<Avatar | null> {
    return await this.avatarRepository.findOne({ where: { userId } });
  }

  /**
   * 删除用户头像 (同步删除文件和数据库记录)
   */
  async remove(userId: string): Promise<void> {
    this.logger.log(`开始删除用户 ${userId} 的头像`);
    
    const avatar = await this.avatarRepository.findOne({ where: { userId } });
    if (!avatar) {
      this.logger.warn(`尝试删除不存在的头像: userId=${userId}`);
      throw new NotFoundException('该用户暂无头像');
    }

    // 1. 先删除磁盘文件
    try {
      await this.fileService.deleteFile(avatar.path);
    } catch (error: any) {
      this.logger.error(`删除头像文件失败，但将继续删除数据库记录: ${avatar.path}`, error.stack);
      // 注意：这里不 throw，确保数据库脏数据能被清理
    }

    // 2. 再删除数据库记录
    await this.avatarRepository.remove(avatar);
    this.logger.log(`用户 ${userId} 头像及文件已成功删除`);
  }
}