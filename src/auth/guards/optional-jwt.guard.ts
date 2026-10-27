// src/auth/guards/optional-jwt.guard.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_COOKIE_NAME } from '../../common/constants.js';

/**
 * 请求里到底有没有带凭证（请求头 / Cookie / 查询参数）。
 *
 * 只有「完全没带」才降级成游客；带了但无效（过期、伪造、用户被删）必须报 401，
 * 否则前端会把它当成「没权限」，用户只看到 403 而不知道该去刷新 Token。
 */
function hasCredential(req: any): boolean {
  if (req?.headers?.authorization) return true;
  if (typeof req?.headers?.cookie === 'string' && req.headers.cookie.includes(AUTH_COOKIE_NAME)) return true;
  return typeof req?.query?.access_token === 'string' && req.query.access_token.length > 0;
}

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any, _info?: any, context?: ExecutionContext): TUser {
    if (user) return user as TUser;

    const req = context?.switchToHttp().getRequest();
    if (!hasCredential(req)) return null as TUser;

    // validate() 里抛的异常自带状态码（如「用户不存在或已被删除」），原样抛出
    if (err) throw err;
    throw new UnauthorizedException('登录状态已失效，请重新登录');
  }
}
