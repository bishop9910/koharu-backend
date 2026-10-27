// src/auth/auth.controller.ts
import { 
  Controller, 
  Get,
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Req,
  Res
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { 
  ApiTags, 
  ApiOperation, 
  ApiOkResponse, 
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Role } from '../enums/role.enum.js';
import { AUTH_COOKIE_NAME } from '../common/constants.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * 获取登录密码加密公钥
   * GET /auth/public-key
   */
  @Get('public-key')
  @ApiOperation({ 
    summary: '获取登录密码加密公钥', 
    description: '返回 RSA 公钥（SPKI PEM）。前端用 RSA-OAEP(SHA-256) 加密登录密码后，再以 encrypted=true 提交 /auth/login' 
  })
  @ApiOkResponse({
    description: 'RSA 公钥',
    schema: {
      type: 'object',
      properties: {
        publicKey: { type: 'string', description: 'RSA 公钥（PEM 格式）' }
      }
    }
  })
  getPublicKey() {
    return { publicKey: this.authService.getPublicKey() };
  }

  /**
   * 登录
   * POST /auth/login
   */
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ 
    summary: '用户登录', 
    description: '使用用户名和密码进行认证，成功后返回 Access Token 和 Refresh Token。失败次数过多会暂时拒绝（同一用户名 15 分钟 5 次 / 同一 IP 20 次，可通过 `auth.login_throttle` 配置）' 
  })
  @ApiOkResponse({
    description: '登录成功',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', description: '用于访问受保护资源的短期 Token' },
        refreshToken: { type: 'string', description: '用于刷新 Access Token 的长期 Token' },
        expiresIn: { type: 'number', description: 'Access Token 的有效期（毫秒）', example: 86400000 },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            role: { type: 'string', enum: Object.values(Role), example: Role.USER }
          }
        }
      }
    }
  })
  @ApiBadRequestResponse({ description: '用户名或密码错误' })
  @ApiResponse({
    status: 429,
    description: '登录失败次数过多，请稍后重试',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 429 },
        message: { type: 'string', example: '登录失败次数过多，请 892 秒后再试' },
        error: { type: 'string', example: 'Too Many Requests' },
        retryAfterMs: { type: 'number', description: '距离可以再次尝试的毫秒数', example: 891540 },
      },
    },
  })
  async login(@Body() loginDto: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginWithThrottle(loginDto, req.ip);
    this.setAuthCookie(res, result.accessToken, result.expiresIn);
    return result;
  }

  /**
   * 刷新 Token
   * POST /auth/refresh
   */
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ 
    summary: '刷新 Access Token', 
    description: '当 Access Token 过期时，使用有效的 Refresh Token 换取新的 Access Token，无需重新登录' 
  })
  @ApiOkResponse({
    description: '刷新成功',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', description: '新的 Access Token' },
        expiresIn: { type: 'number', description: '新 Access Token 的有效期（毫秒）', example: 86400000 }
      }
    }
  })
  @ApiUnauthorizedResponse({ description: '无效的 Refresh Token 或已过期，请重新登录' })
  async refresh(@Body() dto: RefreshTokenDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refreshToken(dto);
    this.setAuthCookie(res, result.accessToken, result.expiresIn);
    return result;
  }

  /**
   * 登录 / 刷新后同时下发一份 httpOnly Cookie。
   *
   * 浏览器发 <img>、<video>、<a download> 请求时不会带 Authorization 头，
   * 图片接口若只认 Bearer，用户就看不到自己未过审的缩略图（必然 403）。
   * JwtStrategy 会把 Cookie 作为 Bearer 之外的备选来源，两条通道等价。
   */
  private setAuthCookie(res: Response, accessToken: string, maxAgeMs: number): void {
    res.cookie(AUTH_COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      // 生产走 HTTPS 时应把 server.cookie_secure 设为 true
      secure: this.configService.get<boolean>('server.cookie_secure', false),
      path: '/',
      maxAge: maxAgeMs,
    });
  }
}