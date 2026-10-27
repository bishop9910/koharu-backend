// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './log/logger.module.js';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { dump } from 'js-yaml';
import { version } from './version.js';
import { API_PREFIX } from './common/constants.js';
import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  // 所有接口统一加 /api 前缀
  app.setGlobalPrefix(API_PREFIX);

  // 托管前端构建产物（SPA），非 /api、/api-doc 的 GET 请求回退到 index.html
  const frontendDir = path.resolve(
    process.cwd(),
    configService.get<string>('server.frontend_dir', './frontend/dist'),
  );
  const indexHtml = path.join(frontendDir, 'index.html');
  app.useStaticAssets(frontendDir, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isReserved =
      req.path.startsWith('/api') || req.path.startsWith('/api-doc');
    if (req.method === 'GET' && !isReserved && fs.existsSync(indexHtml)) {
      res.sendFile(indexHtml);
      return;
    }
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Koharu API')
    .setDescription(
      'Koharu 后端服务 API 文档\n\n' +
        '全局约定：所有接口统一前缀 `/api`；路径参数 `:id` / `:userId` 必须为 UUID，格式非法时直接返回 400，不会进入业务逻辑。\n\n' +
        '鉴权凭证支持三种携带方式，任选其一：`Authorization: Bearer <token>`、`koharu_token` Cookie（登录/刷新时下发，供 `<img>` / `<a download>` 等原生请求使用）、`?access_token=<token>` 查询参数（跨域导致 Cookie 不可用时）。带了凭证但已失效返回 401；完全不携带凭证时按游客处理（仅公开资源可用）。',
    )
    .setVersion(version)
    .addBearerAuth() // 添加 JWT 认证支持
    // 浏览器原生请求（<img src>、<a download>）带不了自定义头，登录/刷新时还会下发同名 HttpOnly Cookie
    .addCookieAuth('koharu_token', { type: 'apiKey', in: 'cookie' }, 'koharu_token')
    .addTag('auth', '认证模块')
    .addTag('users', '用户模块')
    .addTag('images', '图库模块')
    .addTag('avatars', '头像模块')
    .addTag('audit-logs', '审计日志模块')
    .addTag('albums', '图集模块')
    .addTag('tags', '标签模块')
    .build();

  const port = configService.get<number>('server.port', 3000);

  app.useGlobalPipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true,
  }));

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-doc', app, document);

  app.getHttpAdapter().get('/api-yaml', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', 'attachment; filename="koharu-api.yaml"');
    res.send(dump(document));
  });

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
  logger.log(`Swagger docs: http://localhost:${port}/api-doc`, 'Bootstrap');
}

bootstrap();
