// src/image/image.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Image } from '../entities/image.entity.js';
import { ImageService } from './image.service.js';
import { ImageController } from './image.controller.js';
import { LibraryModule } from '../library/library.module.js';
import { ReviewExemptionModule } from '../review/review-exemption.module.js';

// FileModule 已经是 @Global()，所以这里不需要显式 import，直接注入即可

@Module({
  imports: [
    // 注册 Image Entity，让 ImageService 可以注入 Repository
    TypeOrmModule.forFeature([Image]),
    // 原图与缩略图落盘前加密、读取前解密，需要图库密钥服务
    LibraryModule,
    // 审核自己上传的图片需要查自审赦免名单（管理员及以上天然豁免）
    ReviewExemptionModule,
  ],
  controllers: [ImageController],
  providers: [ImageService],
  exports: [ImageService], // 导出以便其他模块（如 PostModule, CommentModule）可以引用图片服务
})
export class ImageModule {}