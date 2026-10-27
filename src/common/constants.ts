/**
 * 全局路由前缀。main.ts 的 setGlobalPrefix 与拼接对外链接的地方（如签名下载地址）共用，
 * 避免某处硬编码成 '/images/...' 漏掉 '/api' 导致链接 404。
 */
export const API_PREFIX = 'api';

/**
 * 登录后下发的 httpOnly Cookie 名。
 *
 * 浏览器发 <img>/<video>/<a download> 请求时不会带 Authorization 头，若只支持 Bearer，
 * 前端拿到的缩略图/原图地址在「未过审但属于自己」的图片上必然 403。登录与刷新时同时写一份
 * Cookie，JwtStrategy 再把它作为 Bearer 之外的备选提取方式，图片标签才能带上身份。
 */
export const AUTH_COOKIE_NAME = 'koharu_token';
