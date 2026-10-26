// src/common/utils/mime.util.ts
import * as path from 'path';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * 按文件扩展名推断图片 MIME 类型。
 * 图片缩略图、原图下载、头像流都需要，统一放在这里，避免各处各写一份映射表。
 */
export function mimeFromPath(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
