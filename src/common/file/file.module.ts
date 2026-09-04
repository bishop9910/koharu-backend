// src/common/file/file.module.ts
import { Global, Module } from '@nestjs/common';
import { FileService } from './file.service.js';

@Global()
@Module({
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}