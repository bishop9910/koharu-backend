// src/audit/audit-log.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { AuditLogService } from './audit-log.service.js';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    const method = (req.method ?? '').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    res.on('finish', () => {
      const routePath = (req as any).route?.path ?? (req.originalUrl?.split('?')[0] ?? req.url);
      const detail = req.path === '/auth/login' ? { username: (req.body as any)?.username } : null;

      void this.auditLogService.record({
        actorId: (req as any).user?.id ?? null,
        actorUsername: (req as any).user?.username ?? null,
        actorRole: (req as any).user?.role ?? null,
        action: `${method} ${routePath}`,
        method,
        path: req.originalUrl?.split('?')[0] ?? req.url,
        statusCode: res.statusCode,
        ip: req.ip ?? null,
        userAgent: req.headers?.['user-agent'] ?? null,
        durationMs: Date.now() - start,
        detail,
        success: res.statusCode < 400,
      });
    });

    return next.handle();
  }
}
