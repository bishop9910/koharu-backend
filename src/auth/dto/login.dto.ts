// src/auth/dto/login.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ description: '密码', example: 'Admin@123456' })
  @IsString()
  @MinLength(6)
  password: string;
}