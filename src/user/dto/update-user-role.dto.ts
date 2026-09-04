// src/user/dto/update-user-role.dto.ts
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../enums/role.enum.js';

export class UpdateUserRoleDto {
  @ApiProperty({ 
    description: '要修改的目标角色', 
    enum: Role,
    example: Role.ADMIN
  })
  @IsEnum(Role, { message: '角色必须是有效的枚举值' })
  role: Role;
}