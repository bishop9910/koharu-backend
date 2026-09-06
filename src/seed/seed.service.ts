// src/seed/seed.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity.js';
import { Role } from '../enums/role.enum.js';
import { generateRandomHash } from '../common/utils/hash.util.js';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    this.logger.log('正在检查系统初始化管理员...');

    const admin = await this.userRepository.findOne({
      where: { username: 'admin' },
      withDeleted: true,
    });

    if (admin) {
      if (admin.role !== Role.SUPER_ADMIN) {
        admin.role = Role.SUPER_ADMIN;
        await this.userRepository.save(admin);
        this.logger.log(`已提升既有管理员 ${admin.username} 为超级管理员 (SUPER_ADMIN)。`);
      } else {
        this.logger.log(`超级管理员已存在: ${admin.username}，跳过初始化。`);
      }
      return;
    }

    this.logger.warn('未检测到管理员，正在创建默认超级管理员账号...');

    const password = generateRandomHash(16);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const adminUser = this.userRepository.create({
      username: 'admin',
      email: 'admin@koharu.local',
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      emailVerified: true,
    });

    try {
      await this.userRepository.save(adminUser);
      this.logger.log('默认超级管理员创建成功！');
      this.logger.log('用户名: admin');
      this.logger.log(`密码: ${password}`);

      const adminInfoDir = path.resolve(process.cwd(), 'adminInfo');
      if (!fs.existsSync(adminInfoDir)) {
        fs.mkdirSync(adminInfoDir);
      }
      const adminInfoFileDir = path.join(adminInfoDir, 'info.json');
      fs.writeFileSync(adminInfoFileDir, JSON.stringify({
        username: 'admin',
        password: password,
      }));
      this.logger.log(`默认超级管理员信息已生成在${adminInfoFileDir}文件中，忘记初始密码请记得查看。`);
      this.logger.warn('请在生产环境中立即修改此密码！');
    } catch (error) {
      this.logger.error('创建默认超级管理员失败:', error);
    }
  }
}
