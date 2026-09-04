// src/common/utils/hash.util.ts
import * as crypto from 'crypto';

/**
 * 计算 Buffer 的 MD5 Hash
 * @param buffer 文件二进制数据
 * @returns 32位十六进制字符串
 */
export function calculateMD5(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * 计算文件的 SHA-256 Hash (更安全，推荐用于签名)
 */
export function calculateSHA256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 随机生成n位hash值
 */
export function generateRandomHash(n: number): string {
  return crypto.randomBytes(n).toString('hex');
}