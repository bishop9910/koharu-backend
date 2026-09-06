// src/user/dto/user-response.dto.ts
import { OmitType } from '@nestjs/swagger';
import { User } from '../../entities/user.entity.js';

export class UserResponseDto extends OmitType(User, ['password'] as const) {}
