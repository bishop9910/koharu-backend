// src/user/dto/update-user.dto.ts
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 用于更新用户信息的 DTO。
 * 用户名仅限本人修改；角色请使用专门的 PATCH /users/:id/role 接口。
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '用户名 (至少3个字符，仅本人可修改)', example: 'new_username' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @ApiPropertyOptional({ description: '电子邮箱', example: 'new@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '个人简介', example: 'Hello World' })
  @IsOptional()
  @IsString()
  bio?: string;
}
