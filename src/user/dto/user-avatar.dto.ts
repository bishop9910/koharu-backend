// src/user/dto/user-avatar.dto.ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * 嵌套在各个用户响应里的头像信息。
 *
 * 之所以单独定义而不是复用 Avatar 实体：User 实体对 Avatar 只做 `import type`，
 * `emitDecoratorMetadata` 会把 `design:type` 降级成 `Function`，Swagger 里就变成一个
 * 空对象（`Function: { type: object, properties: {} }`），与真实返回不符。
 * 这里用显式的 `type: () => UserAvatarDto` 绕开循环依赖，同时保证文档字段准确。
 */
export class UserAvatarDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: '头像文件在存储中的相对路径' })
  path: string;

  @ApiProperty({ format: 'uuid', description: '头像所属用户 ID' })
  userId: string;

  @ApiProperty()
  createdAt: Date;
}
