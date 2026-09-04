// src/user/dto/change-password.dto.ts
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: '当前旧密码', example: 'OldPassword123' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ description: '新密码 (至少6个字符)', example: 'NewPassword456' })
  @IsString()
  @MinLength(6, { message: '新密码至少需要6个字符' })
  newPassword: string;
}