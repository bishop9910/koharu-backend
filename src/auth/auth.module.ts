// src/auth/auth.module.ts
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UserModule } from '../user/user.module.js';
import { PassportModule } from '@nestjs/passport'

@Global()
@Module({
  imports: [
    UserModule, // 引入 UserModule 以使用 UserService
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
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports:  [AuthService, PassportModule, JwtModule], 
})
export class AuthModule {}