import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Config } from './common/config/default.js';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService<Config, true>) {}

  getWelcome(): string {
    return `Welcome to<br/>koharu backend<br/>version: beta`;
  }
}
