// src/auth/interfaces/jwt-payload.interface.ts
import { Role } from '../../enums/role.enum.js';

/**
 * JWT 载荷
 */
export interface JwtPayload {
  sub: string;
  /**
   * 令牌用途：
   * - `access`：普通访问令牌（旧版本签发的令牌没有该字段，仍按 access 处理）
   * - `refresh`：刷新令牌，只能用于 /auth/refresh
   * - `reauth`：敏感操作前的短期再认证票据，不能当访问令牌或刷新令牌使用
   */
  purpose?: 'access' | 'refresh' | 'reauth';
}

/**
 * JwtStrategy.validate
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
}
