// src/common/utils/role.util.ts
import { Role } from '../../enums/role.enum.js';

const ROLE_RANK: Record<Role, number> = {
  [Role.GUEST]: 0,
  [Role.USER]: 1,
  [Role.MODERATOR]: 2,
  [Role.ADMIN]: 3,
  [Role.SUPER_ADMIN]: 4,
};

export function roleRank(role: Role): number {
  return ROLE_RANK[role] ?? 0;
}

export function isAtLeast(role: Role, minRole: Role): boolean {
  return roleRank(role) >= roleRank(minRole);
}

export function isStaff(role: Role): boolean {
  return isAtLeast(role, Role.MODERATOR);
}

export function canManageTarget(actorRole: Role, targetRole: Role): boolean {
  switch (actorRole) {
    case Role.SUPER_ADMIN:
      return true;
    case Role.ADMIN:
      return targetRole === Role.MODERATOR || targetRole === Role.USER || targetRole === Role.GUEST;
    case Role.MODERATOR:
      return targetRole === Role.USER || targetRole === Role.GUEST;
    default:
      return false;
  }
}

export function assignableRoles(actorRole: Role): Role[] {
  switch (actorRole) {
    case Role.SUPER_ADMIN:
      return [Role.ADMIN, Role.MODERATOR, Role.USER, Role.GUEST];
    case Role.ADMIN:
      return [Role.MODERATOR, Role.USER, Role.GUEST];
    case Role.MODERATOR:
      return [Role.USER, Role.GUEST];
    default:
      return [];
  }
}
