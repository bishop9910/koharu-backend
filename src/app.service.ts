import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Config } from './config/default.js';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService<Config, true>) {}

  getHello(): string {
    return 'Hello World!';
  }

  getServerConfig(): Config["server"]{
    return this.configService.get("server");
  }
}
