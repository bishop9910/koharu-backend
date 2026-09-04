// src/user/dto/update-user.dto.ts
import { IsString, IsEmail, IsOptional, IsEnum, IsBoolean, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../enums/role.enum.js';

/**
 * 用于更新用户信息的 DTO。
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '用户名 (至少3个字符)', example: 'new_username' })
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

  @ApiPropertyOptional({ description: '用户角色', enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: '邮箱是否已验证' })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

}