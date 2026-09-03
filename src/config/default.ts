export const default_config = {
  database: {
    postgres: {
      host: "localhost",
      port: 5432,
      username: "your_username",
      password: "your_password",
      database: "your_db_name",
      synchronize: false,
      logging: false
    }
  },
  server: {
    port: 9910,
    token: {
      key: "hash", // token密钥 hash
      timeout: 24 * 60 * 1000, // 毫秒, 一天
      refresh_timeout: 8 * 24 * 60 * 1000 // 8天
    },
    image_lib: {
      path: "./images",
      cache_path : "./image_cache",
      cache_time: 24 * 60 * 1000 // 毫秒, 一天, 签字好的image生成hash副本和缩略图放在缓存, 存1天
    },
  },
  upload: {
    dir: './uploads',           // 上传根目录
    avatarDir: './uploads/avatars', // 头像子目录
    maxSize: 7 * 1024 * 1024,   // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  logger: {
    level: 'info',         // 日志级别: error, warn, info, http, verbose, debug, silly
    dir: './logs',         // 日志文件存放目录
    maxSize: '20m',        // 单个日志文件最大大小 (超过后自动分割)
    maxDays: '14d',        // 日志保留天数 (超过后自动删除)
    enableConsole: true,   // 是否同时输出到控制台
  }
}

export type Config = typeof default_config;