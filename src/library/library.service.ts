// src/library/library.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LibrarySecret, WrappedDataKey } from '../entities/library-secret.entity.js';
import { Image } from '../entities/image.entity.js';
import { FileService } from '../common/file/file.service.js';
import { LibraryCryptoService } from './library-crypto.service.js';

/** 每批处理的图片数量，避免一次性把整库行读进内存。 */
const ROTATION_BATCH_SIZE = 100;
/** 进度落库间隔（每处理这么多文件写一次 rotationDone）。 */
const PROGRESS_FLUSH_EVERY = 20;

export interface LibraryStatus {
  bootstrapped: boolean;
  unlocked: boolean;
  activeVersion: number;
  rotation: {
    status: 'idle' | 'running' | 'failed';
    total: number;
    done: number;
    error: string | null;
  };
}

/**
 * 图库密钥的生命周期：初始化、解锁、改密码（含后台轮转）、历史明文补偿加密。
 *
 * 「改密码要重加密全库」如果同步做，意味着改密码期间下载/缩略图全部失败。这里的做法是：
 * 1. 生成新一代数据密钥（version+1），用新密码派生的 KEK 包裹；
 * 2. 立刻切换活跃版本——此后新上传的文件用新密钥；
 * 3. 后台逐文件把旧版本重加密成新版本，期间两代密钥都在内存里，读哪一代都行；
 * 4. 全部成功后才丢弃旧密钥。服务全程可用，中途重启会从 rotationStatus 继续。
 */
@Injectable()
export class LibraryService implements OnModuleInit {
  private readonly logger = new Logger(LibraryService.name);

  private initialized: Promise<LibrarySecret> | null = null;
  private rotating = false;

  constructor(
    @InjectRepository(LibrarySecret)
    private readonly secretRepository: Repository<LibrarySecret>,
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    private readonly fileService: FileService,
    private readonly cryptoService: LibraryCryptoService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const secret = await this.ensureInitialized();
      if (secret.rotationStatus === 'running' || secret.rotationStatus === 'failed') {
        if (this.cryptoService.unlocked) {
          this.logger.warn(`检测到未完成的密钥轮转 (${secret.rotationStatus})，继续处理剩余文件`);
          void this.runRotation(secret.id, secret.activeVersion);
        }
      }
      // 升级前的明文文件在后台逐步转成密文，不阻塞启动
      if (this.cryptoService.unlocked) {
        void this.encryptLegacyPlaintext();
      }
    } catch (error: any) {
      this.logger.error(`图库密钥初始化失败: ${error?.message ?? error}`);
    }
  }

  /** 幂等初始化：没有密钥记录就建一条并生成初始密码；已解锁则直接返回。 */
  async ensureInitialized(): Promise<LibrarySecret> {
    if (!this.initialized) {
      this.initialized = this.doEnsureInitialized();
      // 初始化失败时允许下次调用重试，而不是永久缓存 rejected promise
      this.initialized.catch(() => {
        this.initialized = null;
      });
    }
    return this.initialized;
  }

  private async doEnsureInitialized(): Promise<LibrarySecret> {
    const existing = await this.findSecret();
    if (existing) {
      if (!this.cryptoService.unlocked) {
        await this.tryAutoUnlock(existing);
      }
      return existing;
    }

    const password = crypto.randomBytes(15).toString('base64url');
    const salt = this.cryptoService.generateSalt();
    const kek = this.cryptoService.deriveKek(password, salt);
    const dataKey = this.cryptoService.generateDataKey();

    const secret = this.secretRepository.create({
      salt: salt.toString('base64'),
      passwordHash: await bcrypt.hash(password, 10),
      activeVersion: 1,
      keys: [{ version: 1, wrappedKey: this.cryptoService.wrapKey(dataKey, kek) }],
      rotationStatus: 'idle',
      rotationTotal: 0,
      rotationDone: 0,
      rotationError: null,
    });
    const saved = await this.secretRepository.save(secret);
    this.cryptoService.addKey(1, dataKey, 1);
    await this.appendPasswordToAdminInfo(password);
    this.logger.log('图库密钥已初始化：数据密钥已生成并写入数据库');
    return saved;
  }

  /** 从 adminInfo/info.json 里的图库密码自动解锁（重启后免手动解锁）。 */
  private async tryAutoUnlock(secret: LibrarySecret): Promise<void> {
    const info = await this.readAdminInfo();
    const password = info?.library?.password;
    if (typeof password !== 'string' || !password) {
      this.logger.warn('adminInfo/info.json 中没有图库密码，图库保持锁定状态');
      return;
    }
    if (!(await bcrypt.compare(password, secret.passwordHash))) {
      this.logger.warn('adminInfo/info.json 中的图库密码与数据库不一致，图库保持锁定状态');
      return;
    }
    try {
      const kek = this.cryptoService.deriveKek(password, Buffer.from(secret.salt, 'base64'));
      this.cryptoService.unlockWith(kek, secret.keys, secret.activeVersion);
    } catch (error: any) {
      this.logger.error(`图库自动解锁失败: ${error?.message ?? error}`);
    }
  }

  private async findSecret(): Promise<LibrarySecret | null> {
    const rows = await this.secretRepository.find({ take: 1, order: { createdAt: 'ASC' } });
    return rows[0] ?? null;
  }

  private adminInfoPath(): string {
    return path.resolve(process.cwd(), 'adminInfo', 'info.json');
  }

  private async readAdminInfo(): Promise<Record<string, any>> {
    try {
      const raw = await fs.readFile(this.adminInfoPath(), 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * 把图库密码写进 adminInfo/info.json 的 library 键。
   * 只是合并字段，原来的 username / password 等键原样保留。
   */
  private async appendPasswordToAdminInfo(password: string): Promise<void> {
    const filePath = this.adminInfoPath();
    try {
      const info = await this.readAdminInfo();
      info.library = { password, createdAt: new Date().toISOString() };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(info, null, 2), 'utf8');
      await fs.chmod(filePath, 0o600).catch(() => {});
      this.logger.log(`图库密码已写入 ${filePath}（保留原有字段，权限 0600）`);
    } catch (error: any) {
      // adminInfo 可能只读（容器只读挂载、权限不足），但密钥已经进库，
      // 这里不能把初始化整体打回，否则图库永远起不来；密码必须留给人。
      this.logger.error(
        `图库密码写入 ${filePath} 失败：${error?.message ?? error}。` +
          `本次图库密码为 ${password}，请立即人工保存；否则重启后需要调用 POST /api/library/password 重置。`,
      );
    }
  }

  async getStatus(): Promise<LibraryStatus> {
    const secret = await this.findSecret();
    return {
      bootstrapped: !!secret,
      unlocked: this.cryptoService.unlocked,
      activeVersion: secret?.activeVersion ?? 0,
      rotation: {
        status: secret?.rotationStatus ?? 'idle',
        total: secret?.rotationTotal ?? 0,
        done: secret?.rotationDone ?? 0,
        error: secret?.rotationError ?? null,
      },
    };
  }

  /** 手动解锁：仅当服务重启后没有 adminInfo 密码、或密码文件被删时才会用到。 */
  async unlock(password: string): Promise<LibraryStatus> {
    const secret = await this.ensureInitialized();
    if (!(await bcrypt.compare(password, secret.passwordHash))) {
      throw new BadRequestException('图库密码错误');
    }
    const kek = this.cryptoService.deriveKek(password, Buffer.from(secret.salt, 'base64'));
    this.cryptoService.unlockWith(kek, secret.keys, secret.activeVersion);
    this.logger.warn('图库已通过管理员手动解锁');
    return this.getStatus();
  }

  /**
   * 修改图库密码：立即换新数据密钥并切活跃版本，旧密钥保留到后台轮转结束。
   * 返回时图片仍可正常访问（受影响的只是「尚未重加密」的文件仍在用旧密钥）。
   */
  async changePassword(oldPassword: string, newPassword: string) {
    const secret = await this.ensureInitialized();

    if (!(await bcrypt.compare(oldPassword, secret.passwordHash))) {
      throw new BadRequestException('原图库密码不正确');
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与原密码相同');
    }

    const kek = this.cryptoService.deriveKek(newPassword, Buffer.from(secret.salt, 'base64'));
    const nextVersion = secret.activeVersion + 1;
    const dataKey = this.cryptoService.generateDataKey();
    const keys: WrappedDataKey[] = [
      ...secret.keys,
      { version: nextVersion, wrappedKey: this.cryptoService.wrapKey(dataKey, kek) },
    ];

    const total = await this.imageRepository.count();

    secret.passwordHash = await bcrypt.hash(newPassword, 10);
    secret.activeVersion = nextVersion;
    secret.keys = keys;
    secret.rotationStatus = total > 0 ? 'running' : 'idle';
    secret.rotationTotal = total;
    secret.rotationDone = 0;
    secret.rotationError = null;
    await this.secretRepository.save(secret);

    // 先切内存里的活跃版本：新上传立刻用 vN+1，旧文件仍能用旧密钥读
    this.cryptoService.addKey(nextVersion, dataKey, nextVersion);
    await this.appendPasswordToAdminInfo(newPassword);

    if (total > 0) {
      void this.runRotation(secret.id, nextVersion);
    }

    this.logger.warn(
      `图库密码已更新，活跃密钥版本 v${nextVersion}，${total} 张图片将在后台重加密`,
    );
    return {
      message: total > 0 ? '图库密码已更新，图片正在后台重加密（期间服务可用）' : '图库密码已更新',
      activeVersion: nextVersion,
      rotationTotal: total,
    };
  }

  /** 后台逐文件重加密到目标版本；全部成功后丢弃旧密钥。 */
  private async runRotation(secretId: string, targetVersion: number): Promise<void> {
    if (this.rotating) return;
    this.rotating = true;

    let done = 0;
    let failed = 0;
    let lastId = '';

    try {
      for (;;) {
        const batch = await this.imageRepository.find({
          where: lastId ? { id: MoreThan(lastId) } : {},
          select: { id: true, path: true, thumbnailPath: true },
          order: { id: 'ASC' },
          take: ROTATION_BATCH_SIZE,
        });
        if (batch.length === 0) break;

        for (const image of batch) {
          lastId = image.id;
          try {
            if (image.path && (await this.fileService.exists(image.path))) {
              const stored = await this.fileService.readFile(image.path);
              if (this.cryptoService.peekVersion(stored) !== targetVersion) {
                const plain = this.cryptoService.decrypt(stored);
                await this.fileService.writeFileAtomically(
                  image.path,
                  this.cryptoService.encryptAs(plain, targetVersion),
                );
              }
            }
            // 缩略图是派生缓存：删掉让它在下次访问时用新密钥重建，比逐个重加密更省事
            if (image.thumbnailPath) {
              await this.fileService.deleteFile(image.thumbnailPath).catch(() => {});
            }
          } catch (error: any) {
            failed += 1;
            this.logger.error(`图片 ${image.id} 重加密失败: ${error?.message ?? error}`);
          }
          done += 1;
          if (done % PROGRESS_FLUSH_EVERY === 0) {
            await this.secretRepository.update(secretId, { rotationDone: done });
          }
        }
      }

      if (failed === 0) {
        // 全库都已用新密钥，旧密钥不再需要
        const secret = await this.secretRepository.findOne({ where: { id: secretId } });
        if (secret) {
          secret.keys = secret.keys.filter((item) => item.version === targetVersion);
          secret.rotationStatus = 'idle';
          secret.rotationDone = done;
          secret.rotationError = null;
          await this.secretRepository.save(secret);
        }
        this.logger.log(`密钥轮转完成：${done} 张图片已用 v${targetVersion} 重加密，旧密钥已丢弃`);
      } else {
        await this.secretRepository.update(secretId, {
          rotationStatus: 'failed',
          rotationDone: done,
          rotationError: `${failed} 个文件重加密失败，旧密钥已保留；重启会重试`,
        });
        this.logger.error(`密钥轮转失败：${failed} 个文件未完成，旧密钥已保留以便重试`);
      }
    } catch (error: any) {
      await this.secretRepository
        .update(secretId, { rotationStatus: 'failed', rotationError: `${error?.message ?? error}`.slice(0, 500) })
        .catch(() => {});
      this.logger.error(`密钥轮转中断: ${error?.message ?? error}`);
    } finally {
      this.rotating = false;
    }
  }

  /**
   * 向下兼容：把升级前已经存在的明文图片与缩略图补偿加密。
   * 只在已解锁时执行；失败的文件保持明文（读取端对明文是透传的，不会坏）。
   */
  private async encryptLegacyPlaintext(): Promise<void> {
    let converted = 0;
    let lastId = '';

    for (;;) {
      const batch = await this.imageRepository.find({
        where: lastId ? { id: MoreThan(lastId) } : {},
        select: { id: true, path: true, thumbnailPath: true },
        order: { id: 'ASC' },
        take: ROTATION_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const image of batch) {
        lastId = image.id;
        for (const target of [image.path, image.thumbnailPath]) {
          if (!target) continue;
          try {
            if (!(await this.fileService.exists(target))) continue;
            const stored = await this.fileService.readFile(target);
            if (this.cryptoService.isEncrypted(stored)) continue;
            await this.fileService.writeFileAtomically(target, this.cryptoService.encryptAs(stored, this.cryptoService.currentVersion));
            converted += 1;
          } catch (error: any) {
            this.logger.warn(`历史文件补偿加密失败 ${target}: ${error?.message ?? error}`);
          }
        }
      }
    }

    if (converted > 0) {
      this.logger.log(`已把 ${converted} 个历史明文文件转为密文（向下兼容完成）`);
    }
  }
}
