/**
 * 全局路由前缀。main.ts 的 setGlobalPrefix 与拼接对外链接的地方（如签名下载地址）共用，
 * 避免某处硬编码成 '/images/...' 漏掉 '/api' 导致链接 404。
 */
export const API_PREFIX = 'api';
