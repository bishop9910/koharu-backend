// src/auth/auth.module.ts
import { Global, Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { RsaService } from './rsa.service.js';
import { UserModule } from '../user/user.module.js';
import { PassportModule } from '@nestjs/passport'

const INSECURE_FALLBACK_SECRET = 'default_secret';

@Global()
@Module({
  imports: [
    UserModule, // 引入 UserModule 以使用 UserService
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('server.token.key', INSECURE_FALLBACK_SECRET);
        if (!secret || secret === INSECURE_FALLBACK_SECRET) {
          const logger = new Logger('JwtModule');
          logger.error(
            'server.token.key 未配置或仍在使用内置默认值 default_secret，JWT 可被轻易伪造，存在提权风险。请立即在 configs/config.yaml 中设置高强度随机密钥。',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: Math.floor(configService.get<number>('server.token.timeout', 24 * 60 * 60 * 1000) / 1000)
          },
        };
      },
      inject: [ConfigService],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RsaService],
  exports:  [AuthService, PassportModule, JwtModule], 
})
export class AuthModule {}