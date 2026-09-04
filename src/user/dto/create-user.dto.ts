// src/user/dto/create-user.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Role } from '../../enums/role.enum.js';

export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: '用户名至少3个字符' })
  username: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MinLength(6, { message: '密码至少6个字符' })
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}