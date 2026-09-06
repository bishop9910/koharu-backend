// src/album/album.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Album } from '../entities/album.entity.js';
import { Tag } from '../entities/tag.entity.js';
import { Image } from '../entities/image.entity.js';
import { User } from '../entities/user.entity.js';
import { AlbumService } from './album.service.js';
import { AlbumController } from './album.controller.js';
import { TagController } from './tag.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Album, Tag, Image, User])],
  controllers: [AlbumController, TagController],
  providers: [AlbumService],
  exports: [AlbumService],
})
export class AlbumModule {}
