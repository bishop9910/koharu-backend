// src/seed/seed.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity.js';
import { SeedService } from './seed.service.js';
import { LibraryModule } from '../library/library.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), LibraryModule],
  providers: [SeedService],
})
export class SeedModule {}