// src/avatar/avatar.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Avatar } from '../entities/avatar.entity.js';
import { AvatarSubmission } from '../entities/avatar-submission.entity.js';
import { User } from '../entities/user.entity.js';
import { FileService } from '../common/file/file.service.js';
import { AvatarStatus } from '../enums/avatar-status.enum.js';
import { canManageTarget } from '../common/utils/role.util.js';

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @InjectRepository(Avatar)
    private avatarRepository: Repository<Avatar>,
    @InjectRepository(AvatarSubmission)
    private submissionRepository: Repository<AvatarSubmission>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private fileService: FileService,
  ) {}

  async submit(userId: string, file: Express.Multer.File, currentUser: any): Promise<AvatarSubmission> {
    if (currentUser.id !== userId) {
      throw new ForbiddenException('只能上传自己的头像');
    }

    const pending = await this.submissionRepository.findOne({
      where: { userId, status: AvatarStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('已有待审核的头像，请等待审核结果');
    }

    const newPath = await this.fileService.saveFile(file, 'avatars');
    const submission = this.submissionRepository.create({
      userId,
      path: newPath,
      status: AvatarStatus.PENDING,
    });

    const saved = await this.submissionRepository.save(submission);
    this.logger.log(`用户 ${userId} 提交头像，等待审核: ${saved.id}`);
    return saved;
  }

  async review(userId: string, status: AvatarStatus, reviewerId: string, reason?: string) {
    if (status === AvatarStatus.PENDING) {
      throw new BadRequestException('审核状态只能是 approved 或 rejected');
    }

    const pending = await this.submissionRepository.findOne({
      where: { userId, status: AvatarStatus.PENDING },
    });
    if (!pending) {
      throw new NotFoundException('该用户没有待审核的头像');
    }

    if (status === AvatarStatus.REJECTED) {
      if (!reason) {
        throw new BadRequestException('拒绝头像时必须提供原因');
      }

      await this.fileService.deleteFile(pending.path).catch(() => {});
      await this.submissionRepository.remove(pending);

      this.logger.log(`审核员 ${reviewerId} 拒绝用户 ${userId} 的头像 (${reason})，已作废并回退到上一个头像`);
      return { message: '头像已拒绝并作废，已回退到上一个头像' };
    }

    const current = await this.avatarRepository.findOne({ where: { userId } });

    if (current) {
      await this.fileService.deleteFile(current.path).catch(() => {});
      current.path = pending.path;
      const updated = await this.avatarRepository.save(current);
      await this.submissionRepository.remove(pending);
      this.logger.log(`审核员 ${reviewerId} 通过用户 ${userId} 的头像，已更新当前头像`);
      return updated;
    }

    const avatar = this.avatarRepository.create({ userId, path: pending.path });
    const saved = await this.avatarRepository.save(avatar);
    await this.submissionRepository.remove(pending);
    this.logger.log(`审核员 ${reviewerId} 通过用户 ${userId} 的头像，已创建当前头像`);
    return saved;
  }

  async findByUserId(userId: string): Promise<Avatar | null> {
    return await this.avatarRepository.findOne({ where: { userId } });
  }

  async removeAllByUser(userId: string): Promise<void> {
    const avatar = await this.avatarRepository.findOne({ where: { userId } });
    if (avatar) {
      await this.fileService.deleteFile(avatar.path).catch(() => {});
      await this.avatarRepository.remove(avatar);
    }

    const submissions = await this.submissionRepository.find({ where: { userId } });
    for (const submission of submissions) {
      await this.fileService.deleteFile(submission.path).catch(() => {});
      await this.submissionRepository.remove(submission);
    }

    this.logger.log(`已清理用户 ${userId} 的头像及 ${submissions.length} 条头像投稿`);
  }

  async remove(userId: string, currentUser: any): Promise<void> {
    const target = await this.userRepository.findOne({ where: { id: userId } });
    if (!target) {
      throw new NotFoundException(`用户 ID ${userId} 不存在`);
    }

    const isSelf = currentUser.id === userId;
    if (!isSelf && !canManageTarget(currentUser.role, target.role)) {
      throw new ForbiddenException('无权删除该用户的头像');
    }

    const avatar = await this.avatarRepository.findOne({ where: { userId } });
    if (!avatar) {
      throw new NotFoundException('该用户暂无头像');
    }

    await this.fileService.deleteFile(avatar.path).catch(() => {});
    await this.avatarRepository.remove(avatar);
    this.logger.log(`用户 ${userId} 头像及文件已成功删除`);
  }
}
