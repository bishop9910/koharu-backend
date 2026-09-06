// src/cleanup/cleanup.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity.js';
import { ImageModule } from '../image/image.module.js';
import { AvatarModule } from '../avatar/avatar.module.js';
import { CleanupService } from './cleanup.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ImageModule,
    AvatarModule,
  ],
  providers: [CleanupService],
})
export class CleanupModule {}
