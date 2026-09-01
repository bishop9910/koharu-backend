import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service.js';
import configuration from './config/configuration.js';

@Module({
  imports: [
      ConfigModule.forRoot({
        load: [configuration],
        isGlobal: true, // 让 ConfigService 在全局可用
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',       // 数据库类型
        host: 'localhost',      // 数据库主机地址
        port: 5432,             // 数据库端口，PostgreSQL 默认为 5432[reference:6]
        username: 'your_username',
        password: 'your_password',
        database: 'your_database',
        synchronize: true,      // 开发时自动同步数据库结构，生产环境务必设为 false[reference:7]
        autoLoadEntities: true, // 自动加载实体[reference:8]
      }),
    ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
