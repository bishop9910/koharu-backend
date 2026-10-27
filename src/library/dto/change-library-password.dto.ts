// src/library/dto/change-library-password.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangeLibraryPasswordDto {
  @ApiProperty({ description: '当前图库密码', example: 'Vt3nQ8xLk2pRw9a' })
  @IsString({ message: '原密码必须是字符串' })
  @MinLength(1, { message: '原密码不能为空' })
  oldPassword: string;

  @ApiProperty({ description: '新图库密码（至少 8 位）', example: 'Xr7mB2qLs9tYc4d', minLength: 8 })
  @IsString({ message: '新密码必须是字符串' })
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(128, { message: '新密码不能超过 128 位' })
  newPassword: string;
}

export class UnlockLibraryDto {
  @ApiProperty({ description: '图库密码', example: 'Vt3nQ8xLk2pRw9a' })
  @IsString({ message: '图库密码必须是字符串' })
  @MinLength(1, { message: '图库密码不能为空' })
  password: string;
}
