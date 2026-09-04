import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './log/logger.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  // 创建应用实例
  const app = await NestFactory.create(AppModule);

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('server.port', 3000);

  app.useGlobalPipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true,
  }));

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
}

bootstrap();