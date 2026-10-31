// src/auth/login-throttle.service.ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface AttemptBucket {
  failures: number;
  windowStart: number;
  blockedUntil: number;
}

/**
 * 登录与再认证的失败频控（进程内存）。
 *
 * 只统计「密码错误」的次数：按账号与按 IP 各一个桶，
 * 达到阈值后在 block_ms 内直接返回 429，不再查库、不再做 bcrypt 比对，
 * 因此也无法再用于探测账号是否存在。
 *
 * 登录与再认证使用互相独立的桶前缀（登录 u:/ip:，再认证 r:/rip:）：
 * 再认证失败不能把账号的登录入口锁死，反之亦然。
 *
 * 单实例内存实现：多实例部署时各自计数（等效阈值放大），
 * 需要全局一致请换成 Redis 之类的共享存储。
 */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, AttemptBucket>();

  constructor(private readonly configService: ConfigService) {}

  /** 同一用户名允许的失败次数 */
  private get maxFailures(): number {
    return this.configService.get<number>('auth.login_throttle.max_failures', 5);
  }

  /** 同一 IP 允许的失败次数（高于用户名阈值，防止换用户名撞库） */
  private get ipMaxFailures(): number {
    return this.configService.get<number>('auth.login_throttle.ip_max_failures', 20);
  }

  /** 同一用户再认证允许的失败次数 */
  private get reauthMaxFailures(): number {
    return this.configService.get<number>('auth.reauth.max_failures', 5);
  }

  /** 同一 IP 再认证允许的失败次数 */
  private get reauthIpMaxFailures(): number {
    return this.configService.get<number>('auth.reauth.ip_max_failures', 20);
  }

  /** 失败计数的统计窗口 */
  private get windowMs(): number {
    return this.configService.get<number>('auth.login_throttle.window_ms', 15 * 60 * 1000);
  }

  /** 触发后的封禁时长 */
  private get blockMs(): number {
    return this.configService.get<number>('auth.login_throttle.block_ms', 15 * 60 * 1000);
  }

  /**
   * 在尝试登录前调用：仍在封禁期则抛 429。
   */
  assertAllowed(username: string, ip: string): void {
    this.assertNotBlocked([this.usernameKey(username), this.ipKey(ip)], '登录失败次数过多');
  }

  /**
   * 记录一次登录失败；达到阈值则开始封禁。
   */
  recordFailure(username: string, ip: string): void {
    const now = Date.now();
    this.hit(this.usernameKey(username), this.maxFailures, now);
    this.hit(this.ipKey(ip), this.ipMaxFailures, now);
    this.pruneIfNeeded(now);
  }

  /**
   * 登录成功后清掉用户名的失败计数（IP 计数保留，继续拦截撞库扫描）。
   */
  reset(username: string): void {
    this.buckets.delete(this.usernameKey(username));
  }

  /**
   * 在再认证（校验密码）前调用：仍在封禁期则抛 429。
   */
  assertReauthAllowed(userId: string, ip: string): void {
    this.assertNotBlocked([this.reauthUserKey(userId), this.reauthIpKey(ip)], '密码验证失败次数过多');
  }

  /**
   * 记录一次再认证失败；达到阈值则开始封禁。
   */
  recordReauthFailure(userId: string, ip: string): void {
    const now = Date.now();
    this.hit(this.reauthUserKey(userId), this.reauthMaxFailures, now);
    this.hit(this.reauthIpKey(ip), this.reauthIpMaxFailures, now);
    this.pruneIfNeeded(now);
  }

  /**
   * 再认证成功后清掉该用户的失败计数（IP 计数保留，继续拦截批量试探）。
   */
  resetReauth(userId: string): void {
    this.buckets.delete(this.reauthUserKey(userId));
  }

  private assertNotBlocked(keys: string[], messagePrefix: string): void {
    const now = Date.now();
    const retryAfterMs = keys.reduce((max, key) => {
      const bucket = this.buckets.get(key);
      return bucket && bucket.blockedUntil > now ? Math.max(max, bucket.blockedUntil - now) : max;
    }, 0);

    if (retryAfterMs > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `${messagePrefix}，请 ${Math.ceil(retryAfterMs / 1000)} 秒后再试`,
          error: 'Too Many Requests',
          retryAfterMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private hit(key: string, limit: number, now: number): void {
    const bucket = this.buckets.get(key) ?? { failures: 0, windowStart: now, blockedUntil: 0 };
    if (now - bucket.windowStart >= this.windowMs) {
      bucket.failures = 0;
      bucket.windowStart = now;
      bucket.blockedUntil = 0;
    }
    bucket.failures += 1;
    if (bucket.failures >= limit && bucket.blockedUntil <= now) {
      bucket.blockedUntil = now + this.blockMs;
    }
    this.buckets.set(key, bucket);
  }

  private pruneIfNeeded(now: number): void {
    if (this.buckets.size > 5000) {
      this.prune(now);
    }
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.blockedUntil <= now && now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  private usernameKey(username: string): string {
    return `u:${(username ?? '').toLowerCase()}`;
  }

  private ipKey(ip: string): string {
    return `ip:${ip || 'unknown'}`;
  }

  private reauthUserKey(userId: string): string {
    return `r:${userId}`;
  }

  private reauthIpKey(ip: string): string {
    return `rip:${ip || 'unknown'}`;
  }
}
