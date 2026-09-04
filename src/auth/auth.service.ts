// src/auth/auth.service.ts
import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service.js';
import { User } from '../entities/user.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 1. 验证账号密码
   */
  async validateUser(loginDto: LoginDto): Promise<any> {
    const user = await this.userService.findByUsername(loginDto.username);
    if (user && (await bcrypt.compare(loginDto.password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * 2. 登录并生成双 Token
   */
  async login(user: any) {
    const payload = { sub: user.id, username: user.username, role: user.role };

    // 读取配置 (毫秒) 并转换为秒 (JWT 需要)
    const accessTimeoutMs = this.configService.get<number>('server.token.timeout', 24 * 60 * 60 * 1000);
    const refreshTimeoutMs = this.configService.get<number>('server.token.refresh_timeout', 8 * 24 * 60 * 60 * 1000);
    
    const accessExpiresInSec = Math.floor(accessTimeoutMs / 1000);
    const refreshExpiresInSec = Math.floor(refreshTimeoutMs / 1000);

    const accessToken = this.jwtService.sign(payload, { expiresIn: accessExpiresInSec });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: refreshExpiresInSec });

    this.logger.log(`用户 ${user.username} 登录成功`);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTimeoutMs, // 返回毫秒给前端，方便前端做倒计时
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * 3. 刷新 Access Token
   */
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('server.token.key'),
      });

      const accessTimeoutMs = this.configService.get<number>('server.token.timeout', 24 * 60 * 60 * 1000);
      const accessExpiresInSec = Math.floor(accessTimeoutMs / 1000);

      const newPayload = { sub: payload.sub, username: payload.username, role: payload.role };
      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: accessExpiresInSec });

      this.logger.log(`用户 ${payload.username} 刷新了 Access Token`);

      return { 
        accessToken: newAccessToken,
        expiresIn: accessTimeoutMs 
      };
    } catch (error: any) {
      this.logger.warn(`Token 刷新失败: ${error.message}`);
      throw new UnauthorizedException('无效的 Refresh Token，请重新登录');
    }
  }

}