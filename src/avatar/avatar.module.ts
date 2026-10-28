// src/avatar/avatar.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Avatar } from '../entities/avatar.entity.js';
import { AvatarSubmission } from '../entities/avatar-submission.entity.js';
import { User } from '../entities/user.entity.js';
import { AvatarService } from './avatar.service.js';
import { AvatarController } from './avatar.controller.js';
import { ReviewExemptionModule } from '../review/review-exemption.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Avatar, AvatarSubmission, User]),
    // 审核自己提交的头像需要查自审赦免名单（管理员及以上天然豁免）
    ReviewExemptionModule,
  ],
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AvatarModule {}
