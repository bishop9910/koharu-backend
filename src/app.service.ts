// src/app.service.ts

import { Injectable } from '@nestjs/common';
import { version } from './version.js';

@Injectable()
export class AppService {

  getWelcome(): string {
    return `Welcome to<br/>koharu backend<br/>version: ${version}`;
  }
}
