// src/app.controller.ts

import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOkResponse({description: 'welcome', schema: {type: "string", example: "Welcome to<br/>koharu backend<br/>version: beta"}})
  getHello(): string {
    return this.appService.getWelcome();
  }
}
