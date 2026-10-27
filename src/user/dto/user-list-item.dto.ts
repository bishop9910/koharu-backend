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

  @ApiProperty({
    type: String,
    nullable: true,
    description: '当前头像的图片流地址（带 /api 前缀，可直接作为 img src）；无头像时为 null',
    example: '/api/avatars/550e8400-e29b-41d4-a716-446655440000/image',
  })
  avatarUrl: string | null;

  @ApiProperty()
  createdAt: Date;
}
