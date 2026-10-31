// src/auth/dto/verify-password.dto.ts
import { IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 敏感操作前的再认证：只校验「当前登录账号」自己的密码。
 * 用户身份一律取自 Access Token，不接受 username，因此无法用它探测他人密码。
 */
export class VerifyPasswordDto {
  @ApiProperty({
    description: '当前账号的密码。未加密时为明文，encrypted=true 时为 RSA-OAEP(SHA-256) 加密后的 base64',
    example: 'Admin@123456',
  })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({
    description: 'password 是否已使用 /auth/public-key 返回的公钥加密',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;
}
