// src/avatar/avatar.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Avatar } from '../entities/avatar.entity.js';
import { AvatarService } from './avatar.service.js';
import { AvatarController } from './avatar.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Avatar])],
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AvatarModule {}