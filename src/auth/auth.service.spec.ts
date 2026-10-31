// src/auth/auth.service.spec.ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as bcrypt from 'bcrypt';
import { BadRequestException, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

function configWith(values: Record<string, unknown>) {
  return { get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback) } as any;
}

describe('AuthService.verifyPassword', () => {
  let service: AuthService;
  let userService: any;
  let jwtService: any;
  let loginThrottle: any;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-password', 4);
  });

  beforeEach(() => {
    userService = {
      findByIdForAuth: vi.fn().mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        password: passwordHash,
      }),
    };
    jwtService = { sign: vi.fn().mockReturnValue('reauth-ticket') };
    loginThrottle = {
      assertReauthAllowed: vi.fn(),
      recordReauthFailure: vi.fn(),
      resetReauth: vi.fn(),
    };
    service = new AuthService(
      userService,
      jwtService,
      configWith({ 'auth.reauth.ttl_ms': 300_000 }),
      { decrypt: vi.fn() } as any,
      loginThrottle,
    );
  });

  it('密码正确时签发 5 分钟再认证票据', async () => {
    const result = await service.verifyPassword('user-1', { password: 'correct-password' }, '127.0.0.1');

    expect(result).toEqual({ valid: true, reauthToken: 'reauth-ticket', expiresIn: 300_000 });
    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'user-1', purpose: 'reauth' },
      { expiresIn: 300 },
    );
    expect(loginThrottle.resetReauth).toHaveBeenCalledWith('user-1');
  });

  it('密码错误时返回 400，记录失败且不发票据', async () => {
    await expect(
      service.verifyPassword('user-1', { password: 'wrong-password' }, '127.0.0.1'),
    ).rejects.toThrow(BadRequestException);

    expect(loginThrottle.recordReauthFailure).toHaveBeenCalledWith('user-1', '127.0.0.1');
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('处于频控封禁期时直接 429，不再查库', async () => {
    loginThrottle.assertReauthAllowed.mockImplementation(() => {
      throw new HttpException('密码验证失败次数过多，请 60 秒后再试', 429);
    });

    await expect(
      service.verifyPassword('user-1', { password: 'correct-password' }, '127.0.0.1'),
    ).rejects.toMatchObject({ status: 429 });
    expect(userService.findByIdForAuth).not.toHaveBeenCalled();
  });
});
