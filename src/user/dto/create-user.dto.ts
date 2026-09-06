// src/user/dto/create-user.dto.ts
import { IsString, MinLength, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: '用户名 (至少3个字符)', example: 'new_user' })
  @IsString()
  @MinLength(3, { message: '用户名至少3个字符' })
  username: string;

  @ApiProperty({ description: '电子邮箱', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @ApiProperty({ description: '密码 (至少6个字符)', example: 'Password123' })
  @IsString()
  @MinLength(6, { message: '密码至少6个字符' })
  password: string;

  @ApiPropertyOptional({ description: '个人简介', example: 'Hello World' })
  @IsOptional()
  @IsString()
  bio?: string;
}
