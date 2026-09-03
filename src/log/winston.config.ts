import * as winston from 'winston';
import 'winston-daily-rotate-file'; // 引入文件切割插件
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

const consoleFormat = winston.format.printf(({ level, message, timestamp, context, ...meta }) => {
  const ctx = context ? `\x1b[33m[${context}]\x1b[0m` : '';
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} ${level} ${ctx} ${message} ${metaStr}`;
});

export function createWinstonLogger(configService: ConfigService) {
  const loggerConfig = configService.get('logger') || {
    level: 'info', dir: './logs', maxSize: '20m', maxDays: '14d', enableConsole: true,
  };

  const transports: winston.transport[] = [];

  if (loggerConfig.enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          consoleFormat,
        ),
      }),
    );
  }

  const logDir = path.resolve(process.cwd(), loggerConfig.dir);

  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: path.join(logDir, 'error'),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true, // 历史日志自动 gzip 压缩
      maxSize: loggerConfig.maxSize,
      maxFiles: loggerConfig.maxDays,
      level: 'error', // 只记录 error 级别
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(), // 文件中使用 JSON 格式，方便 ELK 等工具分析
      ),
    }),
  );

  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: path.join(logDir, 'combined'),
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: loggerConfig.maxSize,
      maxFiles: loggerConfig.maxDays,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
      ),
    }),
  );

  return winston.createLogger({
    level: loggerConfig.level,
    transports,
  });
}