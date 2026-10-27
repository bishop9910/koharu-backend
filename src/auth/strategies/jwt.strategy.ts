// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service.js';
import { JwtPayload, AuthenticatedUser } from '../interfaces/jwt-payload.interface.js';
import { AUTH_COOKIE_NAME } from '../../common/constants.js';

/**
 * 从 httpOnly Cookie 读取 Token。
 *
 * <img>/<video>/<a download> 这类由浏览器自己发起的请求带不了 Authorization 头，
 * 没有它的话「上传者查看自己未过审的图片」永远是 403。登录与刷新时我们把同一个
 * Access Token 写进 Cookie，这里作为 Bearer 之外的备选来源。
 */
function cookieExtractor(req: any): string | null {
  const raw: string | undefined = req?.headers?.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('server.token.key', 'default_secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('无效的令牌');
    }

    const user = await this.userService.findByIdForAuth(payload.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在或已被删除');
    }

    // 角色与用户名一律从数据库读取，绝不使用 JWT 载荷中的任何权限信息，
    // 供后续的 Controller、MinRoleGuard 与业务服务使用。
    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }
}