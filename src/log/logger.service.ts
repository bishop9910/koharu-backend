import { Injectable, LoggerService } from '@nestjs/common';
import { Logger } from 'winston';

@Injectable()
export class AppLogger implements LoggerService {
  private context?: string;

  constructor(private readonly logger: Logger) {}

  // 设置当前上下文 (通常是类名)
  setContext(context: string) {
    this.context = context;
  }

  log(message: any, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: any, trace?: string, context?: string) {
    // 如果有 trace，将其作为额外信息记录
    this.logger.error(message, { trace, context: context || this.context });
  }

  warn(message: any, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: any, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }

  verbose(message: any, context?: string) {
    this.logger.verbose(message, { context: context || this.context });
  }
}