// src/app.service.ts

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {

  getWelcome(): string {
    return `Welcome to<br/>koharu backend<br/>version: beta`;
  }
}
