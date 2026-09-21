// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity.js';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { ImageModule } from '../image/image.module.js';
import { AvatarModule } from '../avatar/avatar.module.js';
import { AlbumModule } from '../album/album.module.js';
import { SecurityModule } from '../common/security/security.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ImageModule,
    AvatarModule,
    AlbumModule,
    SecurityModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}