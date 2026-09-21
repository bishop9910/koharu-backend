// src/user/dto/change-password.dto.ts
import { IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: '当前旧密码（明文或 RSA-OAEP 加密后的 base64）', example: 'OldPassword123' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ description: '新密码（明文或 RSA-OAEP 加密后的 base64，至少6个字符）', example: 'NewPassword456' })
  @IsString()
  @MinLength(6, { message: '新密码至少需要6个字符' })
  newPassword: string;

  @ApiPropertyOptional({
    description: 'oldPassword / newPassword 是否已使用 /auth/public-key 返回的公钥加密',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;
}