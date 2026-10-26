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
import { In, Repository } from 'typeorm';
import { Avatar } from '../entities/avatar.entity.js';
import { AvatarSubmission } from '../entities/avatar-submission.entity.js';
import { User } from '../entities/user.entity.js';
import { FileService } from '../common/file/file.service.js';
import { mimeFromPath } from '../common/utils/mime.util.js';
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

    // 审核是「他人复核」，不允许审核员给自己提交的头像下结论
    if (pending.userId === reviewerId) {
      throw new ForbiddenException('不能审核自己提交的头像');
    }

    if (status === AvatarStatus.REJECTED) {
      if (!reason) {
        throw new BadRequestException('拒绝头像时必须提供原因');
      }

      await this.fileService.deleteFile(pending.path).catch(() => {});
      await this.submissionRepository.remove(pending);

      this.logger.log(`审核员 ${reviewerId} 拒绝用户 ${userId} 的头像 (${reason})，已作废并回退到上一个头像`);
      return { message: '头像已拒绝并作废，已回退到上一个头像', status, avatar: null };
    }

    const current = await this.avatarRepository.findOne({ where: { userId } });

    if (current) {
      await this.fileService.deleteFile(current.path).catch(() => {});
      current.path = pending.path;
      const updated = await this.avatarRepository.save(current);
      await this.submissionRepository.remove(pending);
      this.logger.log(`审核员 ${reviewerId} 通过用户 ${userId} 的头像，已更新当前头像`);
      return {
        message: '头像已通过审核',
        status,
        avatar: { id: updated.id, userId: updated.userId, createdAt: updated.createdAt },
      };
    }

    const avatar = this.avatarRepository.create({ userId, path: pending.path });
    const saved = await this.avatarRepository.save(avatar);
    await this.submissionRepository.remove(pending);
    this.logger.log(`审核员 ${reviewerId} 通过用户 ${userId} 的头像，已创建当前头像`);
    return {
      message: '头像已通过审核',
      status,
      avatar: { id: saved.id, userId: saved.userId, createdAt: saved.createdAt },
    };
  }

  async findByUserId(userId: string): Promise<Avatar | null> {
    return await this.avatarRepository.findOne({ where: { userId } });
  }

  /**
   * 待审核头像队列：审核界面靠它拿到 userId 再去调 POST /avatars/:userId/review。
   * AvatarSubmission 没有 User 关系（生产 synchronize=false，不新增关联），
   * 这里按 userId 批量补 username，避免 N+1。
   */
  async findPending(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [submissions, total] = await this.submissionRepository.findAndCount({
      where: { status: AvatarStatus.PENDING },
      skip,
      take: limit,
      order: {
        createdAt: 'ASC',
      },
    });

    const userIds = [...new Set(submissions.map((submission) => submission.userId))];
    const users = userIds.length
      ? await this.userRepository.find({
          where: { id: In(userIds) },
          select: { id: true, username: true },
        })
      : [];
    const usernames = new Map(users.map((user) => [user.id, user.username]));

    return {
      data: submissions.map((submission) => ({
        submissionId: submission.id,
        userId: submission.userId,
        username: usernames.get(submission.userId) ?? null,
        status: submission.status,
        imageUrl: `/avatars/${submission.userId}/pending/image`,
        createdAt: submission.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** 审核员查看待审核头像图片；没有待审投稿时报 404。 */
  async getPendingImage(userId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const pending = await this.submissionRepository.findOne({
      where: { userId, status: AvatarStatus.PENDING },
    });
    if (!pending) {
      throw new NotFoundException('该用户没有待审核的头像');
    }

    return {
      buffer: await this.fileService.readFile(pending.path),
      mimeType: mimeFromPath(pending.path),
    };
  }

  /** 当前已过审头像；没有头像时报 400。 */
  async getCurrentImage(userId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const avatar = await this.findByUserId(userId);
    if (!avatar) {
      throw new BadRequestException('该用户暂无头像');
    }

    return {
      buffer: await this.fileService.readFile(avatar.path),
      mimeType: mimeFromPath(avatar.path),
    };
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
