// src/album/album.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Album } from '../entities/album.entity.js';
import { Tag } from '../entities/tag.entity.js';
import { Image } from '../entities/image.entity.js';
import { User } from '../entities/user.entity.js';
import { AlbumLike } from '../entities/album-like.entity.js';
import { AlbumFavorite } from '../entities/album-favorite.entity.js';
import { AlbumReport } from '../entities/album-report.entity.js';
import { ReviewExemptionModule } from '../review/review-exemption.module.js';
import { AlbumService } from './album.service.js';
import { AlbumReactionService } from './album-reaction.service.js';
import { AlbumReportService } from './album-report.service.js';
import { AlbumController } from './album.controller.js';
import { AlbumReportController } from './album-report.controller.js';
import { AlbumReviewController } from './album-review.controller.js';
import { TagController } from './tag.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Album,
      Tag,
      Image,
      User,
      AlbumLike,
      AlbumFavorite,
      AlbumReport,
    ]),
    ReviewExemptionModule,
  ],
  controllers: [
    AlbumController,
    AlbumReportController,
    AlbumReviewController,
    TagController,
  ],
  providers: [AlbumService, AlbumReactionService, AlbumReportService],
  exports: [AlbumService],
})
export class AlbumModule {}
