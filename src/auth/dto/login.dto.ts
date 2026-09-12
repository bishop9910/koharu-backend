// src/auth/dto/login.dto.ts
import { IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({
    description: '密码。未加密时为明文，encrypted=true 时为 RSA-OAEP(SHA-256) 加密后的 base64',
    example: 'Admin@123456',
  })
  @IsString()
  @MinLength(6)
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