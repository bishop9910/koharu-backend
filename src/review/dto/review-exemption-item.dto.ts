// src/review/dto/review-exemption-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../enums/role.enum.js';

/** 自审赦免名单中的一项（只包含被显式授予赦免的用户，管理员及以上不入名单）。 */
export class ReviewExemptionItemDto {
  @ApiProperty({ description: '用户 ID (UUID)', example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ description: '用户名', example: 'koharu_moderator' })
  username: string;

  @ApiProperty({ enum: Role, description: '当前角色（被撤销审核员角色后仍留在名单中，但已无审核权限）' })
  role: Role;
}
