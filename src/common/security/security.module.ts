// src/common/security/security.module.ts
import { Module } from '@nestjs/common';
import { RsaService } from './rsa.service.js';

@Module({
  providers: [RsaService],
  exports: [RsaService],
})
export class SecurityModule {}
