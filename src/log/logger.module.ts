import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppLogger } from './logger.service.js';
import { createWinstonLogger } from './winston.config.js';

const winstonProvider = {
  provide: 'WINSTON_LOGGER',
  useFactory: (configService: ConfigService) => {
    return createWinstonLogger(configService);
  },
  inject: [ConfigService],
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    winstonProvider,
    {
      provide: AppLogger,
      useFactory: (winstonLogger: any) => new AppLogger(winstonLogger),
      inject: ['WINSTON_LOGGER'],
    },
  ],
  exports: [AppLogger],
})
export class LoggerModule {}