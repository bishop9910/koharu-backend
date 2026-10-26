// src/user/dto/user-list-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../enums/role.enum.js';
import { UserAvatarDto } from './user-avatar.dto.js';

/** 用户列表项：与 user.service.findAll 的查询投影一一对应，不含 updatedAt/deletedAt。 */
export class UserListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ nullable: true, type: String })
  bio: string | null;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ type: UserAvatarDto, nullable: true })
  avatar: UserAvatarDto | null;

  @ApiProperty()
  createdAt: Date;
}
