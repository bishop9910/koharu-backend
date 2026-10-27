// src/library/library-crypto.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { WrappedDataKey } from '../entities/library-secret.entity.js';

/**
 * 加密文件布局（全部大端、定长头）：
 *
 *   [0..4)   MAGIC  = "KHR1"，用来区分「已加密」与「升级前的明文历史文件」
 *   [4]      version（1 字节，当前最大 255 代）
 *   [5..17)  iv（12 字节，AES-GCM 的 nonce）
 *   [17..33) tag（16 字节，AES-GCM 认证标签）
 *   [33..]   ciphertext
 *
 * 头部 33 字节之外没有任何元数据，缩略图与头像的 mime 仍由扩展名推断。
 */
const MAGIC = Buffer.from('KHR1', 'ascii');
const VERSION_OFFSET = 4;
const IV_OFFSET = 5;
const IV_LEN = 12;
const TAG_OFFSET = IV_OFFSET + IV_LEN;
const TAG_LEN = 16;
const BODY_OFFSET = TAG_OFFSET + TAG_LEN;
const KEY_LEN = 32;
const SALT_LEN = 32;

@Injectable()
export class LibraryCryptoService {
  private readonly logger = new Logger(LibraryCryptoService.name);

  /** 已解包的数据密钥：version -> key */
  private keys = new Map<number, Buffer>();
  private activeVersion = 0;

  get unlocked(): boolean {
    return this.activeVersion > 0;
  }

  get currentVersion(): number {
    return this.activeVersion;
  }

  get isLibraryLocked(): boolean {
    return !this.unlocked;
  }

  static isEncryptedFile(buffer: Buffer): boolean {
    return buffer.length > BODY_OFFSET && buffer.subarray(0, 4).equals(MAGIC);
  }

  static peekVersion(buffer: Buffer): number | null {
    return LibraryCryptoService.isEncryptedFile(buffer) ? buffer[VERSION_OFFSET] : null;
  }

  isEncrypted(buffer: Buffer): boolean {
    return LibraryCryptoService.isEncryptedFile(buffer);
  }

  peekVersion(buffer: Buffer): number | null {
    return LibraryCryptoService.peekVersion(buffer);
  }

  generateSalt(): Buffer {
    return crypto.randomBytes(SALT_LEN);
  }

  generateDataKey(): Buffer {
    return crypto.randomBytes(KEY_LEN);
  }

  /** 图库密码 -> KEK。scrypt 的代价参数取默认值（N=16384, r=8, p=1，约 50~100ms），足以让暴力破解变慢。 */
  deriveKek(password: string, salt: Buffer): Buffer {
    return crypto.scryptSync(password, salt, KEY_LEN);
  }

  /** 用 KEK 包裹数据密钥，返回 base64(iv.tag.ciphertext)。 */
  wrapKey(dataKey: Buffer, kek: Buffer): string {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  unwrapKey(wrappedKey: string, kek: Buffer): Buffer {
    const raw = Buffer.from(wrappedKey, 'base64');
    if (raw.length <= IV_LEN + TAG_LEN) {
      throw new Error('包裹数据密钥格式错误');
    }
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** 解包全部数据密钥并进入已解锁状态；任一条解包失败说明密码不对。 */
  unlockWith(kek: Buffer, wrappedKeys: WrappedDataKey[], activeVersion: number): void {
    const unlocked = new Map<number, Buffer>();
    for (const item of wrappedKeys) {
      try {
        unlocked.set(item.version, this.unwrapKey(item.wrappedKey, kek));
      } catch {
        this.logger.warn(`数据密钥 v${item.version} 解包失败，已跳过`);
      }
    }
    if (unlocked.size === 0) {
      throw new Error('无法解包任何数据密钥');
    }
    this.keys = unlocked;
    // 当前版本缺失时退回到最大的可用版本，宁可读得出来也不要整库不可用
    this.activeVersion = unlocked.has(activeVersion)
      ? activeVersion
      : Math.max(...unlocked.keys());
    this.logger.log(`图库密钥已解锁，共 ${unlocked.size} 代，当前版本 v${this.activeVersion}`);
  }

  /** 轮转中新增一代密钥（不清空旧密钥，旧文件还要用旧密钥读）。 */
  addKey(version: number, dataKey: Buffer, activeVersion = version): void {
    this.keys.set(version, dataKey);
    this.activeVersion = activeVersion;
  }

  clear(): void {
    this.keys.clear();
    this.activeVersion = 0;
  }

  private activeKey(): Buffer {
    if (!this.unlocked) {
      throw new ServiceUnavailableException('图库处于锁定状态，请管理员先调用 POST /api/library/unlock 解锁');
    }
    const key = this.keys.get(this.activeVersion);
    if (!key) {
      throw new ServiceUnavailableException(`缺少数据密钥 v${this.activeVersion}，无法加解密`);
    }
    return key;
  }

  encrypt(plain: Buffer): Buffer {
    return this.encryptWith(plain, this.activeKey(), this.activeVersion);
  }

  encryptWith(plain: Buffer, key: Buffer, version: number): Buffer {
    if (version < 1 || version > 255) {
      throw new InternalServerErrorException(`数据密钥版本超出可写入范围: ${version}`);
    }
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([MAGIC, Buffer.from([version]), iv, cipher.getAuthTag(), ciphertext]);
  }

  /** 用指定版本的数据密钥加密（轮转时用目标版本写回，不影响当前活跃版本）。 */
  encryptAs(plain: Buffer, version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) {
      throw new ServiceUnavailableException(`缺少数据密钥 v${version}，无法重加密`);
    }
    return this.encryptWith(plain, key, version);
  }

  /**
   * 解密。没有 KHR1 魔数的文件按「升级前的明文」原样返回，
   * 这样新代码可以直接跑在老数据上，等后台补偿加密把它们转成密文。
   */
  decrypt(stored: Buffer): Buffer {
    if (!LibraryCryptoService.isEncryptedFile(stored)) {
      return stored;
    }
    const version = stored[VERSION_OFFSET];
    const key = this.keys.get(version);
    if (!key) {
      throw new ServiceUnavailableException(
        `缺少数据密钥 v${version}，无法解密图片。请管理员用当前图库密码重新解锁，或重新设置图库密码以触发重加密`,
      );
    }
    const iv = stored.subarray(IV_OFFSET, TAG_OFFSET);
    const tag = stored.subarray(TAG_OFFSET, BODY_OFFSET);
    const ciphertext = stored.subarray(BODY_OFFSET);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (error: any) {
      this.logger.error(`图片解密失败(v${version}): ${error?.message}`);
      throw new InternalServerErrorException('图片解密失败：文件已损坏，或密钥与图库密码不匹配');
    }
  }
}
