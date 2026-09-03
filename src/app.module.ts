import { Module } from '@nestjs/common';
import { LoggerModule } from './log/logger.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service.js';
import configuration from './config/configuration.js';

@Module({
  imports: [
      ConfigModule.forRoot({
        load: [configuration],
        isGlobal: true,
      }),
      TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          type: 'postgres',       // 数据库类型
          host: configService.get<string>("database.postgres.host", "localhost"),      // 数据库主机地址
          port: configService.get<number>("database.postgres.port", 5432),             // 数据库端口，PostgreSQL 默认为 5432[reference:6]
          username: configService.get<string>("database.postgres.username", "your_username"),
          password: configService.get<string>("database.postgres.password", "your_password"),
          database: configService.get<string>("database.postgres.database", "your_db_name"),
          synchronize: configService.get<boolean>('database.postgres.synchronize', true),      // 开发时自动同步数据库结构，生产环境务必设为 false[reference:7]
          autoLoadEntities: true, // 自动加载实体[reference:8]
          logging: configService.get<boolean>('database.postgres.logging', false),
        }),
      }),
      LoggerModule
    ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
