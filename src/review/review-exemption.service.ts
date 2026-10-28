// src/review/review-exemption.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity.js';
import { Role } from '../enums/role.enum.js';
import { isAtLeast, isStaff } from '../common/utils/role.util.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { ReviewExemptionItemDto } from './dto/review-exemption-item.dto.js';

/**
 * 自审赦免名单。
 *
 * 审核默认是「他人复核」：审核员不能给上传者是自己、提交者也是自己的内容下结论
 * （见 ImageService.reviewImage / AvatarService.review）。
 * 这里放行两类人：
 *   1) 管理员及以上（ADMIN / SUPER_ADMIN）—— 天然豁免，不看 users.reviewExempt；
 *   2) 被管理员显式加入赦免名单的审核员 —— users.reviewExempt = true。
 * USER / GUEST 没有审核权限，因此加名单没有意义，也不允许加。
 */
@Injectable()
export class ReviewExemptionService {
  private readonly logger = new Logger(ReviewExemptionService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 该审核员是否豁免「不能审核自己」的限制。
   *
   * 只有被审者就是本人时调用方才会走到这里，所以多一次查询不影响普通审核路径。
   */
  async isSelfReviewExempt(userId: string, role: Role): Promise<boolean> {
    if (isAtLeast(role, Role.ADMIN)) return true;
    if (!userId) return false;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, reviewExempt: true },
    });
    return user?.reviewExempt === true;
  }

  /** 赦免名单（仅显式授予者；管理员及以上天然豁免，不在此列）。 */
  async list(): Promise<ReviewExemptionItemDto[]> {
    const users = await this.userRepository.find({
      where: { reviewExempt: true },
      select: { id: true, username: true, role: true },
      order: { username: 'ASC' },
    });

    return users.map((user) => ({
      userId: user.id,
      username: user.username,
      role: user.role,
    }));
  }

  /** 把一名审核员加入赦免名单；管理员及以上无需加入。 */
  async grant(targetUserId: string, actor: AuthenticatedUser): Promise<ReviewExemptionItemDto> {
    const target = await this.userRepository.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    if (isAtLeast(target.role, Role.ADMIN)) {
      throw new ConflictException('管理员及以上角色默认可审核自己的图片，无需加入赦免名单');
    }
    if (!isStaff(target.role)) {
      throw new BadRequestException('只能给审核员授予自审赦免（USER / GUEST 没有审核权限）');
    }
    if (target.reviewExempt) {
      throw new ConflictException('该用户已在赦免名单中');
    }

    await this.userRepository.update(target.id, { reviewExempt: true });
    this.logger.log(`管理员 ${actor.id} 将用户 ${target.id} (${target.username}) 加入自审赦免名单`);

    return { userId: target.id, username: target.username, role: target.role };
  }

  /** 把一名审核员移出赦免名单；管理员及以上本就豁免，不在名单中。 */
  async revoke(targetUserId: string, actor: AuthenticatedUser): Promise<{ message: string }> {
    const target = await this.userRepository.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    if (isAtLeast(target.role, Role.ADMIN)) {
      throw new BadRequestException('管理员及以上角色默认不受自审限制，不需要也不允许从赦免名单移除');
    }
    if (!target.reviewExempt) {
      throw new NotFoundException('该用户不在赦免名单中');
    }

    await this.userRepository.update(target.id, { reviewExempt: false });
    this.logger.log(`管理员 ${actor.id} 将用户 ${target.id} (${target.username}) 移出自审赦免名单`);

    return { message: '已移出自审赦免名单' };
  }
}
