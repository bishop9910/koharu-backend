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
| `cookie_secure` | `false` | 登录/刷新时下发的 `koharu_token` Cookie 是否带 `Secure`。反向代理后启用 HTTPS 时应设为 `true` |

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
├── adminInfo/info.json     # 首次 seed 写入的初始管理员账号 + 密码；图库密码也在这里（library.password）
├── uploads/
│   ├── images/             # 原图（AES-256-GCM 密文）
│   ├── avatars/            # 当前头像与待审头像（同目录，明文）
│   └── image_cache/        # 缩略图缓存（密文，删掉会自动重建）
└── logs/
    ├── combined/combined-YYYY-MM-DD.log
    └── error/error-YYYY-MM-DD.log
```

`rsa_*.pem` 一旦生成就不会覆盖；删掉会导致此前加密的密码请求失效（前端需要重新取公钥）。

`adminInfo/` 必须可写：图库密码初始化与每次改密码都会回写 `library` 键。写不进去时服务不会崩，但会把本次密码打进 `error` 日志——**这是唯一一次能在日志里看到明文密码的机会**，请立刻记录，否则重启后要重置。

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

### 打包成 Windows 可执行文件（可选）

`scripts/package-sea.mjs` 用 Node 官方的 SEA（Single Executable Application）把服务打成 `koharu.exe`，适合把后端直接丢给一台装有 PostgreSQL 的 Windows 机器。

```bash
pnpm add -D esbuild postject     # 只需一次
node scripts/package-sea.mjs     # 产物在 dist-exe/
```

产物结构：

```text
dist-exe/
├─ koharu.exe            # 90 MB 左右（内含 Node 22 + 打包后的应用代码）
├─ node_modules/         # 只放原生模块与必须落盘的包：sharp、@img/sharp-win32-x64、bcrypt、pg、strtok3、swagger-ui-dist
├─ configs/              # 从项目复制来的配置（含 RSA 密钥对）
├─ adminInfo/            # seed 写入 admin 与图库密码
├─ uploads/              # images / avatars / image_cache
└─ logs/                 # error / combined
```

启动方式：`cd dist-exe && .\koharu.exe`（**必须**从 `dist-exe` 目录启动，配置、上传、日志都按当前工作目录解析）。

为什么不是真单文件：

| 依赖 | 原因 |
|---|---|
| `sharp` | 运行时按自身路径找 `@img/sharp-win32-x64` 里的 libvips DLL 与 `.node`，必须留在磁盘上 |
| `bcrypt` | `.node` 原生插件无法塞进可执行文件 |
| `pg` | TypeORM 通过 `createRequire()` 在运行时加载驱动 |
| `swagger-ui-dist` | `@nestjs/swagger` 从磁盘读静态资源 |

打包脚本已经处理的四个坑（改动前请先读脚本注释）：

1. `import.meta.url` 在 CJS 产物里是空对象，而 `@nestjs/typeorm` 在模块顶层用它 `createRequire` → 脚本把占位符替换成 `process.execPath`。
2. SEA 的全局 `require()` 只能载内置模块，TypeORM 的 `PlatformTools.load()` 会因此报「Postgres package has not been found installed」→ 脚本注入 `__seaRequire`（先按 exe 同级 `node_modules` 解析，再退回启动目录）并改写该函数。
3. `file-type` 用动态 `import('strtok3')`，SEA 里解析不到 → 脚本改写 `importAtRuntime` 并对 `strtok3` 一并出包。
4. esbuild 会把重名类改名（`class Avatar` → `class Avatar2`），而 TypeORM 的实体关系按 `target.name` 字符串解析 → 必须带 `--keep-names`。

冒烟脚本：先在 `dist-exe` 下启动 exe，再在项目根目录 `node scripts/smoke-packaged.mjs`，覆盖登录（bcrypt）、待审核队列（pg）、打包后的 Swagger、上传与缩略图（sharp）。

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

## 6. 图库密码运维

图库密码不是用户密码，它是**图片静态加密**的根：所有原图与缩略图在磁盘上都是 AES-256-GCM 密文，密钥由这个密码派生。

| 场景 | 操作 |
|---|---|
| 首次启动 | 自动生成 20 字符随机密码，写进 `adminInfo/info.json` 的 `library.password`，同时把数据密钥包裹后存 `library_secrets` 表 |
| 重启 | 从 `adminInfo/info.json` 读回密码自动解锁；文件缺失或哈希对不上则进入锁定态（`GET /api/library/status` 的 `unlocked=false`），缩略图/下载/上传返回 `503` |
| 锁定后自救 | `POST /api/library/unlock`，body `{ "password": "…" }`，需要 ADMIN+ |
| 改密码 | `POST /api/library/password`，body `{ "oldPassword": "…", "newPassword": "…" }`，需要 ADMIN+ |
| 忘记密码 | 没有后门。只能用旧密码解锁后改，或删掉 `library_secrets` 全部行 + `adminInfo` 里的 `library` 键让服务重新初始化——后者会让**已加密的旧图片永远解不开**，只能连 `uploads/images` 一起清掉 |

改密码的执行顺序（`LibraryService.changePassword`）：

1. 校验旧密码（bcrypt）→ 立即生成新盐、新 KEK、新数据密钥，`activeVersion` 加一；
2. 新旧密钥同时留在内存里，**服务不停**；
3. 后台分批（每批 100 条）把原图从旧版本解密再用新版本加密，缩略图直接删除待重建；
4. 全部成功后只保留新版本密钥、`rotationStatus` 回到 `idle`；有失败则停在 `failed` 并保留旧密钥，状态里能看到 `rotation.error`；
5. 进度看 `GET /api/library/status` 的 `rotation.total / rotation.done`。

所以**不需要停服**：轮转期间新旧版本的文件都能读。

## 7. 上线检查清单

| 项 | 要求 |
|---|---|
| `database.postgres.synchronize` | 必须 `false` |
| `server.token.key` | 换成随机长字符串（≥32 字符），不要用仓库里的值 |
| `configs/rsa_private.pem` | 权限 `0600`，不进版本库 |
| `adminInfo/info.json` | 首次登录后改密码，然后删除该文件 |
| `upload.dir` / `logs` | 所在磁盘留足空间；`logs` 需可写 |
| 反向代理 | 按 §5 处理真实 IP |
| `adminInfo/` | 必须可写（图库密码回写），权限 `0600` |
| `library_secrets` | 与 `uploads/` 同等重要：两者一起备份，缺一不可解密 |
| 备份 | `pg_dump` + `uploads/` 目录，两者要一起备份（库里的 `path` 指向文件） |
