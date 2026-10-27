// src/library/library.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LibrarySecret } from '../entities/library-secret.entity.js';
import { Image } from '../entities/image.entity.js';
import { LibraryService } from './library.service.js';
import { LibraryCryptoService } from './library-crypto.service.js';
import { LibraryController } from './library.controller.js';

/**
 * 图库加密模块。导出加解密服务，供图片模块在读写文件时调用；
 * 自身只依赖实体与全局 FileModule，不反向 import ImageModule，避免循环依赖。
 */
@Module({
  imports: [TypeOrmModule.forFeature([LibrarySecret, Image])],
  controllers: [LibraryController],
  providers: [LibraryService, LibraryCryptoService],
  exports: [LibraryService, LibraryCryptoService],
})
export class LibraryModule {}
