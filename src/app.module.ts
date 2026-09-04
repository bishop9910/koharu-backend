import { Module } from '@nestjs/common';
import { LoggerModule } from './log/logger.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service.js';
import configuration from './common/config/configuration.js';
import { FileModule } from './common/file/file.module.js';
import { AvatarModule } from './avatar/avatar.module.js';
import { SeedModule } from './seed/seed.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ImageModule } from './image/image.module.js';

@Module({
  imports: [
      ConfigModule.forRoot({
        load: [configuration],
        isGlobal: true,
      }),
      TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const dbConfig = configService.get('database.postgres');
          return {
            type: 'postgres',
            host: dbConfig.host,
            port: dbConfig.port,
            username: dbConfig.username,
            password: dbConfig.password,
            database: dbConfig.database,
            synchronize: dbConfig.synchronize, // 开发时可临时改为 true，生产保持 false
            logging: dbConfig.logging,
            autoLoadEntities: true,
          };
        },
      }),
      AuthModule,
      LoggerModule,
      FileModule,
      AvatarModule,
      ImageModule,
      SeedModule
    ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
