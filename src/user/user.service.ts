// src/user/user.service.ts
import { 
  Injectable, 
  Logger, 
  NotFoundException, 
  ConflictException, 
  ForbiddenException, 
  BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { Role } from '../enums/role.enum.js';
import { FileService } from '../common/file/file.service.js';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private fileService: FileService, // 用于删除用户时清理头像文件
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // 1. 检查用户名或邮箱是否已存在
    const existing = await this.userRepository.findOne({
      where: [{ username: createUserDto.username }, { email: createUserDto.email }],
      withDeleted: true, // 检查软删除的记录
    });

    if (existing) {
      throw new ConflictException('用户名或邮箱已被注册');
    }

    // 2. 加密密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    // 3. 创建并保存
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: createUserDto.role || Role.USER,
    });

    const savedUser = await this.userRepository.save(user);
    this.logger.log(`新用户注册成功: ${savedUser.username}`);
    
    // 返回时剔除密码
    const { password, ...result } = savedUser;
    return result as User;
  }

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;

    // findAndCount 会返回 [数据数组, 总数量]
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
      skip,       // 跳过多少条
      take: limit, // 获取多少条
      order: {
        createdAt: 'DESC', // 按创建时间倒序，最新注册的排在前面
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

  /**
   * 通过用户名找user,只给auth的jwt验证使用
   * @param username 用户名
   * @returns 找到用户返回<User>找不到返回null
   */
  async findByUsername(username: string): Promise<User | null> {
    return await this.userRepository.findOne({ 
      where: { username },
      relations:  {
        avatar: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, currentUser: any): Promise<Omit<User, 'password'>> {
    const user = await this.findOne(id);

    // 权限校验：只能修改自己的信息，除非是管理员
    if (user.id !== currentUser.id && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('无权修改其他用户的信息');
    }

    // 防止普通用户擅自提升自己的角色
    if (updateUserDto.role && currentUser.role !== Role.ADMIN) {
      delete updateUserDto.role;
    }

    Object.assign(user, updateUserDto);
    const updatedUser = await this.userRepository.save(user);
    
    const { password, ...result } = updatedUser;
    return result as User;
  }

  async remove(id: string, currentUser: any): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        avatar: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`用户 ID ${id} 不存在`);
    }

    if (user.id !== currentUser.id && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('无权删除该用户');
    }

    if (user.avatar) {
      try {
        await this.fileService.deleteFile(user.avatar.path);
        this.logger.log(`已清理用户 ${user.username} 的头像文件`);
      } catch (error) {
        this.logger.warn(`清理用户头像文件失败，但将继续删除用户: ${user.avatar.path}`);
      }
    }

    await this.userRepository.softRemove(user);
    this.logger.log(`用户 ${user.username} 已被软删除`);
  }

  async updateRole(id: string, role: Role, adminUser: any): Promise<Omit<User, 'password'>> {
    if (adminUser.role !== Role.ADMIN) {
      throw new ForbiddenException('仅管理员可修改用户角色');
    }

    const user = await this.findOne(id);
    user.role = role;
    const updated = await this.userRepository.save(user);
    
    this.logger.log(`管理员 ${adminUser.username} 将用户 ${user.username} 的角色修改为 ${role}`);
    const { password, ...result } = updated;
    return result as User;
  }

    /**
   * 获取用户的公开资料 (无需严格权限校验)
   */
  async findPublicProfile(id: string): Promise<{
    id: string;
    username: string;
    bio: string | null;
    role: Role;
    avatar: { path: string } | null; // 通常头像也是公开的
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

  /**
   * 专门用于修改当前用户的密码
   */
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
}