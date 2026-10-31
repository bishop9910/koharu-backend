// src/auth/guards/reauth.guard.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ReauthGuard } from './reauth.guard.js';

function contextFor(user: any, headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, headers }) }),
  } as any;
}

describe('ReauthGuard', () => {
  let guard: ReauthGuard;
  let jwtService: any;

  beforeEach(() => {
    jwtService = { verify: vi.fn() };
    guard = new ReauthGuard(jwtService);
  });

  it('有效票据且账号匹配时放行', () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'reauth' });

    expect(guard.canActivate(contextFor({ id: 'user-1' }, { 'x-reauth-token': 'ticket' }))).toBe(true);
  });

  it('普通 Access Token 不能当再认证票据', () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', purpose: 'access' });

    expect(() =>
      guard.canActivate(contextFor({ id: 'user-1' }, { 'x-reauth-token': 'access-token' })),
    ).toThrow(UnauthorizedException);
  });

  it('他人的再认证票据被拒绝', () => {
    jwtService.verify.mockReturnValue({ sub: 'user-2', purpose: 'reauth' });

    expect(() =>
      guard.canActivate(contextFor({ id: 'user-1' }, { 'x-reauth-token': 'someone-else' })),
    ).toThrow('再认证票据与当前登录账号不匹配');
  });

  it('缺少票据时返回 401', () => {
    expect(() => guard.canActivate(contextFor({ id: 'user-1' }))).toThrow(UnauthorizedException);
  });
});
