// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UserModule } from '../user/user.module.js';
import { User } from '../entities/user.entity.js';

@Module({
  imports: [
    UserModule, // 引入 UserModule 以使用 UserService
    TypeOrmModule.forFeature([User]), // 为了在 AuthService 中直接修改密码
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('server.token.key', 'default_secret'),
        signOptions: { 
          expiresIn: Math.floor(configService.get<number>('server.token.timeout', 24 * 60 * 60 * 1000) / 1000)
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}