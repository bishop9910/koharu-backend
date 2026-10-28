// src/review/review-exemption.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity.js';
import { ReviewExemptionService } from './review-exemption.service.js';
import { ReviewExemptionController } from './review-exemption.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [ReviewExemptionController],
  providers: [ReviewExemptionService],
  exports: [ReviewExemptionService],
})
export class ReviewExemptionModule {}
