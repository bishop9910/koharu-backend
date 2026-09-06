// src/user/user.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { Role } from '../enums/role.enum.js';
import { canManageTarget, assignableRoles } from '../common/utils/role.util.js';
import { ImageService } from '../image/image.service.js';
import { AvatarService } from '../avatar/avatar.service.js';
import { AlbumService } from '../album/album.service.js';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private imageService: ImageService,
    private avatarService: AvatarService,
    private albumService: AlbumService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.userRepository.findOne({
      where: [{ username: createUserDto.username }, { email: createUserDto.email }],
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException('用户名或邮箱已被注册');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const user = this.userRepository.create({
      username: createUserDto.username,
      email: createUserDto.email,
      password: hashedPassword,
      bio: createUserDto.bio,
      role: Role.USER,
    });

    const savedUser = await this.userRepository.save(user);
    this.logger.log(`新用户注册成功: ${savedUser.username}`);

    return this.sanitize(savedUser);
  }

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [users, total] = await this.userRepository.findAndCount({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        bio: true,
        emailVerified: true,
        createdAt: true,
      },
      relations: {
        avatar: true,
      },
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        avatar: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`用户 ID ${id} 不存在`);
    }
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { username },
      relations: {
        avatar: true,
      },
    });
  }

  async getSelf(id: string): Promise<Omit<User, 'password'>> {
    return this.sanitize(await this.findOne(id));
  }

  async getUserDetail(id: string, currentUser: any): Promise<Omit<User, 'password'>> {
    const target = await this.findOne(id);
    if (target.id !== currentUser.id && !canManageTarget(currentUser.role, target.role)) {
      throw new ForbiddenException('无权查看其他用户的详细信息');
    }
    return this.sanitize(target);
  }

  async update(id: string, updateUserDto: UpdateUserDto, currentUser: any): Promise<Omit<User, 'password'>> {
    const target = await this.findOne(id);
    const isSelf = target.id === currentUser.id;

    if (!isSelf && !canManageTarget(currentUser.role, target.role)) {
      throw new ForbiddenException('无权修改其他用户的信息');
    }

    if (updateUserDto.username !== undefined) {
      if (!isSelf) {
        throw new ForbiddenException('用户名仅限本人修改');
      }
      if (target.role === Role.SUPER_ADMIN) {
        throw new ForbiddenException('超级管理员用户名不可修改');
      }
      target.username = updateUserDto.username;
    }
    if (updateUserDto.email !== undefined) {
      target.email = updateUserDto.email;
    }
    if (updateUserDto.bio !== undefined) {
      target.bio = updateUserDto.bio;
    }

    const updatedUser = await this.userRepository.save(target);
    return this.sanitize(updatedUser);
  }

  async remove(id: string, currentUser: any): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`用户 ID ${id} 不存在`);
    }

    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('超级管理员账号不可删除');
    }

    if (user.id !== currentUser.id && !canManageTarget(currentUser.role, user.role)) {
      throw new ForbiddenException('无权删除该用户');
    }

    await this.imageService.removeAllByUser(id);
    await this.avatarService.removeAllByUser(id);
    await this.albumService.removeAllByUser(id);

    await this.userRepository.softRemove(user);
    this.logger.log(`用户 ${user.username} 已被软删除，其图片、头像与图集已联动删除`);
  }

  async updateRole(id: string, role: Role, currentUser: any): Promise<Omit<User, 'password'>> {
    const target = await this.findOne(id);

    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('超级管理员账号的角色不可被修改');
    }

    if (target.id === currentUser.id) {
      throw new ForbiddenException('不能修改自己的角色');
    }

    if (!canManageTarget(currentUser.role, target.role)) {
      throw new ForbiddenException('无权修改该用户的角色');
    }

    if (!assignableRoles(currentUser.role).includes(role)) {
      throw new ForbiddenException('无权将该用户设置为目标角色');
    }

    target.role = role;
    const updated = await this.userRepository.save(target);

    this.logger.log(`${currentUser.username} 将用户 ${target.username} 的角色修改为 ${role}`);
    return this.sanitize(updated);
  }

  async findPublicProfile(id: string): Promise<{
    id: string;
    username: string;
    bio: string | null;
    role: Role;
    avatar: { path: string } | null;
  }> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        username: true,
        bio: true,
        role: true,
        avatar: {
          path: true,
        },
      },
      relations: {
        avatar: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`用户 ID ${id} 不存在`);
    }

    return user as any;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      this.logger.warn(`用户 ${user.username} 尝试修改密码失败：旧密码错误`);
      throw new BadRequestException('原密码错误');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await this.userRepository.save(user);

    this.logger.log(`用户 ${user.username} 成功修改了密码`);
    return { message: '密码修改成功' };
  }

  private sanitize(user: User): Omit<User, 'password'> {
    const { password, ...result } = user;
    return result;
  }
}
