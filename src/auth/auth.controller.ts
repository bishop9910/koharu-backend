// src/auth/auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  UnauthorizedException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiOkResponse, 
  ApiResponse,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * 登录
   * POST /auth/login
   */
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ 
    summary: '用户登录', 
    description: '使用用户名和密码进行认证，成功后返回 Access Token 和 Refresh Token' 
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
            role: { type: 'string', enum: ['admin', 'user', 'guest', 'moderator'] }
          }
        }
      }
    }
  })
  @ApiUnauthorizedResponse({ description: '用户名或密码错误' })
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(loginDto);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return this.authService.login(user);
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
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }
}