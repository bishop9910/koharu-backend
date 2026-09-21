// src/common/security/rsa.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RsaService {
  private readonly logger = new Logger(RsaService.name);
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor() {
    const dir = path.resolve(process.cwd(), 'configs');
    const privatePath = path.join(dir, 'rsa_private.pem');
    const publicPath = path.join(dir, 'rsa_public.pem');

    if (fs.existsSync(privatePath) && fs.existsSync(publicPath)) {
      this.privateKey = fs.readFileSync(privatePath, 'utf8');
      this.publicKey = fs.readFileSync(publicPath, 'utf8');
      this.logger.log('已加载现有 RSA 密钥对');
      return;
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
    fs.writeFileSync(publicPath, publicKey);

    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.logger.log('已生成新的 RSA 密钥对');
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  decrypt(encryptedBase64: string): string {
    const decrypted = crypto.privateDecrypt(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedBase64, 'base64'),
    );
    return decrypted.toString('utf8');
  }
}
