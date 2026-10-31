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
import { VerifyPasswordDto } from './dto/verify-password.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { RsaService } from '../common/security/rsa.service.js';
import { LoginThrottleService } from './login-throttle.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private rsaService: RsaService,
    private loginThrottle: LoginThrottleService,
  ) {}

  /**
   * 验证账号密码
   */
  async validateUser(loginDto: LoginDto): Promise<any> {
    let plainPassword = loginDto.password;
    if (loginDto.encrypted) {
      try {
        plainPassword = this.rsaService.decrypt(loginDto.password);
      } catch {
        this.logger.warn(`用户 ${loginDto.username} 的登录密码解密失败`);
        return null;
      }
    }

    const user = await this.userService.findByUsername(loginDto.username);
    if (user && (await bcrypt.compare(plainPassword, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * 登录入口：先过失败频控，再校验密码，成功后清空该用户名的失败计数。
   */
  async loginWithThrottle(loginDto: LoginDto, ip: string) {
    this.loginThrottle.assertAllowed(loginDto.username, ip);

    const user = await this.validateUser(loginDto);
    if (!user) {
      this.loginThrottle.recordFailure(loginDto.username, ip);
      this.logger.warn(`用户 ${loginDto.username} 登录失败 (IP: ${ip})`);
      throw new BadRequestException('用户名或密码错误');
    }

    this.loginThrottle.reset(loginDto.username);
    return this.login(user);
  }

  /**
   * 返回用于加密登录密码的 RSA 公钥
   */
  getPublicKey(): string {
    return this.rsaService.getPublicKey();
  }

  /**
   * 登录并生成双 Token
   */
  async login(user: any) {
    const accessPayload: JwtPayload = { sub: user.id, purpose: 'access' };
    const refreshPayload: JwtPayload = { sub: user.id, purpose: 'refresh' };

    // 读取配置 (毫秒) 并转换为秒 (JWT 需要)
    const accessTimeoutMs = this.configService.get<number>('server.token.timeout', 24 * 60 * 60 * 1000);
    const refreshTimeoutMs = this.configService.get<number>('server.token.refresh_timeout', 8 * 24 * 60 * 60 * 1000);
    
    const accessExpiresInSec = Math.floor(accessTimeoutMs / 1000);
    const refreshExpiresInSec = Math.floor(refreshTimeoutMs / 1000);

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: accessExpiresInSec });
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: refreshExpiresInSec });

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
   * 再认证：校验当前登录账号自己的密码，成功后签发短期再认证票据。
   *
   * 用于修改密码、删除账号、调整角色等敏感操作前的身份确认。
   * 失败按「用户 + IP」独立计数，不会影响登录频控。
   */
  async verifyPassword(userId: string, dto: VerifyPasswordDto, ip: string) {
    this.loginThrottle.assertReauthAllowed(userId, ip);

    let plainPassword = dto.password;
    if (dto.encrypted) {
      try {
        plainPassword = this.rsaService.decrypt(dto.password);
      } catch {
        this.loginThrottle.recordReauthFailure(userId, ip);
        throw new BadRequestException('密码解密失败，请使用正确的公钥加密');
      }
    }

    const user = await this.userService.findByIdForAuth(userId);
    const matched = !!user && (await bcrypt.compare(plainPassword, user.password));
    if (!matched) {
      this.loginThrottle.recordReauthFailure(userId, ip);
      this.logger.warn(`用户 ${user?.username ?? userId} 再认证失败：密码错误 (IP: ${ip})`);
      throw new BadRequestException('密码错误');
    }

    this.loginThrottle.resetReauth(userId);

    const ttlMs = this.configService.get<number>('auth.reauth.ttl_ms', 5 * 60 * 1000);
    const reauthPayload: JwtPayload = { sub: user.id, purpose: 'reauth' };
    const reauthToken = this.jwtService.sign(reauthPayload, { expiresIn: Math.floor(ttlMs / 1000) });

    this.logger.log(`用户 ${user.username} 通过密码再认证 (IP: ${ip})`);
    return { valid: true, reauthToken, expiresIn: ttlMs };
  }

  /**
   * 刷新 Access Token
   */
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken);

      // 只接受 refresh 令牌；旧版本刷新令牌没有 purpose 字段，继续兼容。
      // access 与 reauth 令牌都不得用于换取新的 Access Token。
      if (!payload?.sub || (payload.purpose && payload.purpose !== 'refresh')) {
        throw new UnauthorizedException('无效的 Refresh Token，请重新登录');
      }

      const user = await this.userService.findByIdForAuth(payload.sub);
      if (!user) {
        throw new UnauthorizedException('用户不存在或已被删除，请重新登录');
      }

      const accessTimeoutMs = this.configService.get<number>('server.token.timeout', 24 * 60 * 60 * 1000);
      const accessExpiresInSec = Math.floor(accessTimeoutMs / 1000);

      const newPayload: JwtPayload = { sub: user.id, purpose: 'access' };
      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: accessExpiresInSec });

      this.logger.log(`用户 ${user.username} 刷新了 Access Token`);

      return { 
        accessToken: newAccessToken,
        expiresIn: accessTimeoutMs 
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(`Token 刷新失败: ${error.message}`);
      throw new UnauthorizedException('无效的 Refresh Token，请重新登录');
    }
  }

}