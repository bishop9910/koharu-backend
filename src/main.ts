import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './log/logger.module.js';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { dump } from 'js-yaml';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Koharu API')
    .setDescription('Koharu 后端服务 API 文档')
    .setVersion('0.0.2')
    .addBearerAuth() // 添加 JWT 认证支持
    .addTag('auth', '认证模块')
    .addTag('users', '用户模块')
    .addTag('images', '图库模块')
    .addTag('avatars', '头像模块')
    .build();

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('server.port', 3000);

  app.useGlobalPipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true,
  }));

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.getHttpAdapter().get('/api-yaml', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', 'attachment; filename="koharu-api.yaml"');
    res.send(dump(document));
  });

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
}

bootstrap();