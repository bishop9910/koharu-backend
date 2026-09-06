// src/common/guards/role.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../enums/role.enum.js';
import { roleRank } from '../utils/role.util.js';

export const MIN_ROLE_KEY = 'min_role';
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);

@Injectable()
export class MinRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<Role>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!minRole) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new UnauthorizedException('请先登录');
    }

    if (roleRank(user.role) < roleRank(minRole)) {
      throw new ForbiddenException(`权限不足：需要 ${minRole} 及以上角色`);
    }

    return true;
  }
}
