// src/cleanup/cleanup.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity.js';
import { ImageService } from '../image/image.service.js';
import { AvatarService } from '../avatar/avatar.service.js';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly retentionMs: number;
  private readonly intervalMs: number;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private imageService: ImageService,
    private avatarService: AvatarService,
    private configService: ConfigService,
  ) {
    this.retentionMs = this.configService.get<number>('cleanup.retention_ms', 14 * 24 * 60 * 60 * 1000);
    this.intervalMs = this.configService.get<number>('cleanup.interval_ms', 24 * 60 * 60 * 1000);
  }

  onModuleInit() {
    this.logger.log('定期清理服务已启动');
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionMs);

    const users = await this.userRepository.find({
      where: { deletedAt: LessThan(cutoff) },
      withDeleted: true,
    });

    if (users.length === 0) {
      this.logger.log('没有需要彻底清理的过期用户');
      return;
    }

    for (const user of users) {
      try {
        await this.imageService.removeAllByUser(user.id);
        await this.avatarService.removeAllByUser(user.id);
        await this.userRepository.delete(user.id);
        this.logger.log(`已彻底删除过期用户: ${user.username} (${user.id})`);
      } catch (error) {
        this.logger.error(`彻底删除用户 ${user.username} 失败: ${(error as Error)?.message}`);
      }
    }

    this.logger.log(`定期清理完成，共彻底删除 ${users.length} 个用户`);
  }
}
