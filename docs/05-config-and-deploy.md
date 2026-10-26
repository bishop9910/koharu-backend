# 05 · 配置与部署

## 1. 配置加载方式

配置只有一个来源：`configs/config.yaml`（可用 `.env`？——**不支持**，没有接入 dotenv；DB 连接也来自 YAML）。

- `ConfigModule.forRoot({ load: [configuration], isGlobal: true })` 在 `src/app.module.ts` 里注册，全局可注入 `ConfigService`。
- `src/common/config/configuration.ts` 读 YAML → `deepMerge(default_config, fileConfig)`：**文件里没写的键自动取 `src/common/config/default.ts` 的默认值**，所以升级版本后新增的键不需要手动补。
- `configs/config.yaml` 不存在时会按默认值生成一份并落盘。
- 默认值里的 `database.postgres` 是占位符（`your_username` / `your_db_name`），首次运行前必须改。

## 2. 配置项

### 2.1 `database.postgres`

| 键 | 默认 | 说明 |
|---|---|---|
| `host` / `port` | `localhost` / `5432` | |
| `username` / `password` / `database` | 占位符 | |
| `synchronize` | `false`（仓库里的 `configs/config.yaml` 是 `true`） | **生产必须 `false`**：实体变更会直接改表结构 |
| `logging` | `false` | 打印 SQL |

### 2.2 `server`

| 键 | 默认 | 说明 |
|---|---|---|
| `port` | `3000` | |
| `frontend_dir` | `./frontend/dist` | SPA 构建产物目录，不存在则跳过静态托管 |
| `token.key` | `default_secret` | JWT / 下载签名共用的 HMAC 密钥，**生产必须换成随机值** |
| `token.timeout` | `86400000` | access token 有效期（毫秒，1 天） |
| `token.refresh_timeout` | `691200000` | refresh token 有效期（毫秒，8 天） |

> `token.key` 同时用于 `createSignature(imageId:expires)`，换密钥会让已发出的下载链接立即失效。

### 2.3 `server.image_lib`

| 键 | 默认 | 说明 |
|---|---|---|
| `path` | `./images` | **已废弃**，仅为兼容旧配置保留；原图固定写 `<upload.dir>/images` |
| `cache_path` | `./uploads/image_cache` | 缩略图缓存目录。**必须在 `upload.dir` 之内**，否则启动时告警并回退到 `<upload.dir>/image_cache` |
| `cache_time` | `86400000` | 签名有效期（毫秒），同时用作 `/images/:id/sign` 返回的 `expiresInMs` |
| `signature.expire_in` | `86400000` | 与 `cache_time` 同义，历史键 |

### 2.4 `upload`

| 键 | 默认 | 说明 |
|---|---|---|
| `dir` | `./uploads` | 上传根目录，所有落盘路径都相对于它 |
| `avatarDir` | `./uploads/avatars` | 保留键，**当前代码未读取**；头像固定写 `<upload.dir>/avatars` |
| `maxSize` | `20971520` | 单文件上限（字节，20MB） |
| `allowedTypes` | `image/jpeg` / `png` / `webp` / `gif` | 按 MIME 白名单 + magic bytes 复检 |

### 2.5 `logger`

| 键 | 默认 | 说明 |
|---|---|---|
| `level` | `info` | `error` / `warn` / `info` / `http` / `verbose` / `debug` / `silly` |
| `dir` | `./logs` | 日志目录；**必须可写**，否则启动即 `EPERM` |
| `maxSize` | `20m` | 单文件分割阈值 |
| `maxDays` | `14d` | 保留天数，过期自动删（含 `zippedArchive` 压缩包） |
| `enableConsole` | `true` | 是否同时输出到控制台 |

### 2.6 `cleanup`

| 键 | 默认 | 说明 |
|---|---|---|
| `retention_ms` | `1209600000` | 软删除用户的保留期（14 天） |
| `interval_ms` | `86400000` | 清理任务间隔（24 小时） |

### 2.7 `auth.login_throttle`

| 键 | 默认 | 说明 |
|---|---|---|
| `max_failures` | `5` | 同一用户名在窗口内的失败上限 |
| `ip_max_failures` | `20` | 同一 IP 在窗口内的失败上限 |
| `window_ms` | `900000` | 计数窗口（15 分钟） |
| `block_ms` | `900000` | 触发后的封禁时长（15 分钟） |

计数在**进程内存**里：多实例部署时各自计数，等效阈值被放大。要全局一致需换成 Redis。

## 3. 运行时目录

```text
<项目根>
├── configs/
│   ├── config.yaml
│   ├── rsa_private.pem     # 首次启动自动生成，权限 0600
│   └── rsa_public.pem      # 首次启动自动生成
├── adminInfo/info.json     # 首次 seed 写入的初始管理员账号 + 密码
├── uploads/
│   ├── images/             # 原图
│   ├── avatars/            # 当前头像与待审头像（同目录）
│   └── image_cache/        # 缩略图缓存
└── logs/
    ├── combined/combined-YYYY-MM-DD.log
    └── error/error-YYYY-MM-DD.log
```

`rsa_*.pem` 一旦生成就不会覆盖；删掉会导致此前加密的密码请求失效（前端需要重新取公钥）。

## 4. 构建与启动

```bash
pnpm install

# 开发（watch）
pnpm start:dev

# 生产
pnpm build
pnpm start:prod        # node dist/main
```

- 端口来自 `server.port`，服务监听全部网卡。
- 启动后 Swagger 在 `/api-doc`，JSON 在 `/api-doc-json`，YAML 在 `/api-yaml`。
- 前端（若 `frontend_dir` 存在）在根路径托管，非 `/api` 的 GET 请求回退到 `index.html`。

### systemd 示例

```ini
[Unit]
Description=koharu backend
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/srv/koharu
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 5. 反向代理注意事项

服务端取客户端 IP 用的是 `req.ip`，而应用**没有配置 `trust proxy`**。如果前面挂了 Nginx 且用 `proxy_pass` 直连，所有请求的 `req.ip` 都会变成 `127.0.0.1`，直接导致：

- 登录频控的 IP 桶退化成「全站共用一个 20 次的计数」；
- `images.uploaderIp` 记录的都是代理地址，「同 IP 每日 500 张」的限制形同虚设；
- 审计日志里的 `ip` 全部失真。

两种修法（二选一）：

```ts
// 方案 A：在 main.ts 里信任一跳代理
app.set('trust proxy', 1);
```

```nginx
# 方案 B：Nginx 透传真实 IP
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

只为 `/api` 做代理时注意保留前缀：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;   # 末尾不要加斜杠，否则 /api 前缀会被剥掉
    client_max_body_size 25m;           # 上传上限 20MB，留点余量
}
```

## 6. 上线检查清单

| 项 | 要求 |
|---|---|
| `database.postgres.synchronize` | 必须 `false` |
| `server.token.key` | 换成随机长字符串（≥32 字符），不要用仓库里的值 |
| `configs/rsa_private.pem` | 权限 `0600`，不进版本库 |
| `adminInfo/info.json` | 首次登录后改密码，然后删除该文件 |
| `upload.dir` / `logs` | 所在磁盘留足空间；`logs` 需可写 |
| 反向代理 | 按 §5 处理真实 IP |
| 备份 | `pg_dump` + `uploads/` 目录，两者要一起备份（库里的 `path` 指向文件） |
