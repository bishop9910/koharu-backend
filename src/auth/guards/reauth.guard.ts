// src/auth/guards/reauth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';

/**
 * 敏感操作前的再认证守卫。
 *
 * 必须与 JwtAuthGuard 一起使用（JwtAuthGuard 先解析出 req.user）：
 * 客户端先调用 POST /api/auth/verify-password 校验当前账号密码，
 * 拿到短期有效的再认证票据，再在 X-Reauth-Token 请求头里带给敏感接口。
 *
 * 票据本身是 JWT，purpose 固定为 reauth，且 sub 必须与当前登录账号一致，
 * 因此不能拿别人的票据、也不能拿普通 Access Token 来冒充。
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) {
      throw new UnauthorizedException('请先登录');
    }

    const header = req.headers?.['x-reauth-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new UnauthorizedException('缺少再认证票据，请先调用 POST /api/auth/verify-password');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('再认证票据无效或已过期，请重新验证密码');
    }

    if (!payload?.sub || payload.purpose !== 'reauth') {
      throw new UnauthorizedException('再认证票据无效或已过期，请重新验证密码');
    }
    if (payload.sub !== user.id) {
      throw new UnauthorizedException('再认证票据与当前登录账号不匹配');
    }

    return true;
  }
}
