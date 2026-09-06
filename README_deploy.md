# Koharu Backend 部署文档

本文档介绍如何把 Koharu Backend 部署到 Linux 服务器（以 Ubuntu/Debian 为例）。

- 技术栈：NestJS (Node.js 22, ESM) + PostgreSQL
- 存储：文件落到本地磁盘（`images` / `image_cache` / `uploads`），元数据入库
- 运行：单进程，推荐 PM2 或 systemd 守护

---

## 目录

- [1. 环境要求](#1-环境要求)
- [2. 安装运行时](#2-安装运行时)
- [3. 获取代码](#3-获取代码)
- [4. 安装依赖](#4-安装依赖)
- [5. 准备数据库](#5-准备数据库)
- [6. 配置文件](#6-配置文件)
- [7. 构建](#7-构建)
- [8. 首次启动建表](#8-首次启动建表)
- [9. 进程守护](#9-进程守护)
- [10. Nginx 反向代理](#10-nginx-反向代理)
- [11. 防火墙与 HTTPS](#11-防火墙与-https)
- [12. 存储目录](#12-存储目录)
- [13. 备份](#13-备份)
- [14. 更新发布](#14-更新发布)
- [15. 健康检查](#15-健康检查)
- [16. 上线安全清单](#16-上线安全清单)
- [17. 常见问题](#17-常见问题)

---

## 1. 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 22.x | 运行时（ESM） |
| bun | 最新版 | 可选，作为运行时 / 包管理器替代 |
| PostgreSQL | 15+ | 数据库 |
| build-essential / python3 | - | 仅当 `bcrypt` / `sharp` 无预编译二进制、需本地编译时才需要 |

> `sharp` 通常自带预编译二进制，无需系统 `libvips`；`bcrypt` 在常见平台也有预编译包。只有极冷门环境才需要 `node-gyp` 编译。

## 2. 安装运行时

Node.js 22（推荐用 nvm 或 NodeSource）：

```bash
# 方式一：nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v   # v22.x

# 方式二：NodeSource（Debian/Ubuntu）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

bun（可选，作为更快的运行时 / 包管理器）：

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun -v
```

> 本项目默认使用 pnpm（仓库含 `pnpm-lock.yaml`）。bun 可用作替代：`bun install` / `bun run build` / `bun dist/main.js`。

## 3. 获取代码

```bash
git clone <你的仓库地址> koharu-backend
cd koharu-backend
```

## 4. 安装依赖

```bash
# 使用 pnpm（推荐，与 lockfile 一致）
npm install -g pnpm
pnpm install --frozen-lockfile

# 或使用 bun
bun install
```

## 5. 准备数据库

创建数据库与专用账号：

```sql
CREATE USER nest_user WITH PASSWORD '你的强密码';
CREATE DATABASE koharu OWNER nest_user;
GRANT ALL PRIVILEGES ON DATABASE koharu TO nest_user;
```

## 6. 配置文件

`configs/` 目录已被 `.gitignore` 忽略，首次启动会自动从 `src/common/config/default.ts` 生成 `configs/config.yaml`，也可以手动创建。

```bash
mkdir -p configs
vim configs/config.yaml
```

最小可用配置：

```yaml
database:
  postgres:
    host: "localhost"
    port: 5432
    username: "nest_user"
    password: "你的数据库密码"
    database: "koharu"
    synchronize: true   # 首次部署设为 true 自动建表，建完立刻改回 false
    logging: false

server:
  port: 3000
  token:
    key: "请替换为一串足够长的随机字符串"   # JWT 签名密钥，务必修改
    timeout: 86400000            # Access Token 有效期（毫秒，1 天）
    refresh_timeout: 691200000   # Refresh Token 有效期（毫秒，8 天）

upload:
  dir: "./uploads"
  avatarDir: "./uploads/avatars"
  maxSize: 20971520              # 20MB
  allowedTypes:
    - image/jpeg
    - image/png
    - image/webp
    - image/gif

cleanup:
  retention_ms: 1209600000       # 软删除保留 2 周
  interval_ms: 86400000          # 每天清理一次
```

> **向后兼容**：配置系统会把 yaml 与默认配置做深度合并，缺失字段自动回退默认值。所以 yaml 里只写你要覆盖的字段即可，完整字段见 `README.md`。

> **生成随机密钥示例**：`openssl rand -hex 32`

## 7. 构建

```bash
pnpm run build     # 产物输出到 dist/
# 或
bun run build
```

### 7.1 生产精简 package.json（可选）

服务器上不必安装构建工具（devDependencies）。推荐流程：

1. 在构建机 / CI 上用完整 package.json 执行 `pnpm install` + `pnpm run build`，得到 `dist/`。
2. 把 `dist/` 和下面这份精简 package.json 一起部署到服务器。
3. 服务器上只安装运行时依赖并启动。

部署用的精简 package.json（无 devDependencies）：

```json
{
  "name": "koharu",
  "version": "0.0.2",
  "description": "A backend of safe image lib system, powered with NestJS",
  "author": "bishop9910",
  "private": true,
  "license": "MIT",
  "type": "module",
  "scripts": {
    "start": "node dist/main.js",
    "start:bun": "bun dist/main.js"
  },
  "dependencies": {
    "@nestjs/common": "^12.0.1",
    "@nestjs/config": "^12.0.0",
    "@nestjs/core": "^12.0.1",
    "@nestjs/jwt": "^12.0.1",
    "@nestjs/mapped-types": "^12.0.0",
    "@nestjs/observe": "^0.1.8",
    "@nestjs/passport": "^12.0.0",
    "@nestjs/platform-express": "^12.0.1",
    "@nestjs/swagger": "^12.0.1",
    "@nestjs/typeorm": "^12.0.1",
    "bcrypt": "^6.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "file-type": "^22.0.2",
    "js-yaml": "^5.4.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.23.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "sharp": "^0.35.4",
    "swagger-ui-express": "^5.0.1",
    "typeorm": "^1.1.0",
    "winston": "^3.19.0",
    "winston-daily-rotate-file": "^5.0.0"
  }
}
```

安装与启动：

```bash
# pnpm：只装运行时依赖
pnpm install --prod

# 启动（= node dist/main.js）
pnpm start

# 或用 bun
bun install --production
bun run start:bun    # = bun dist/main.js
```

> 注意：这份 package.json 不含构建脚本，**构建必须在有 devDependencies 的环境（本地/CI）完成**，服务器只负责运行 `dist/`。

## 8. 首次启动建表

> ⚠️ 本项目当前**没有 TypeORM Migration 文件**，首次部署需要靠 `synchronize: true` 建表。

1. 确认 `configs/config.yaml` 中 `synchronize: true`。
2. 启动一次：

```bash
pnpm run start:prod
```

3. 观察启动日志，会创建表并生成默认超级管理员，日志中会打印初始密码（同时写入 `adminInfo/info.json`）：

```text
默认超级管理员创建成功！
用户名: admin
密码: <随机16位hash>
```

4. **拿到密码后立即**把 `synchronize` 改回 `false`，然后重启。

> 改回 `false` 后，后续字段/枚举变更需通过 Migration 手工处理（本项目尚未提供，详见常见问题）。

## 9. 进程守护

> **重要**：程序用 `process.cwd()` 定位 `configs/ images/ image_cache/ uploads/ logs/ adminInfo/`，所以**必须在项目根目录启动**。

### 方式 A：PM2（推荐）

```bash
npm install -g pm2
```

项目根目录新建 `ecosystem.config.cjs`：

```js
module.exports = {
  apps: [
    {
      name: 'koharu-backend',
      cwd: __dirname,            // 必须是项目根目录
      script: 'dist/main.js',    // 或 'dist/main'
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',     // 影响每日上传限流按天重置的时区
      },
      max_memory_restart: '512M',
      out_file: './logs/pm2_out.log',
      error_file: './logs/pm2_err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```

启动：

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # 开机自启（按提示执行输出的命令）
```

### 方式 B：systemd

`/etc/systemd/system/koharu-backend.service`：

```ini
[Unit]
Description=Koharu Backend
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/koharu-backend
ExecStart=/usr/bin/node dist/main.js
Environment=NODE_ENV=production
Environment=TZ=Asia/Shanghai
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koharu-backend
```

## 10. Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 上传上限：建议不小于 upload.maxSize（20MB），留余量用 100M
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 大文件下载/上传，延长超时
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

> `X-Forwarded-For` 会被审计日志记录来源 IP 使用；若你的图片下载走服务端流式转发，务必保留。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 11. 防火墙与 HTTPS

```bash
# 防火墙：只放行 80/443，3000 端口不对公网开放
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

HTTPS（Let's Encrypt）：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 12. 存储目录

程序运行时会创建并在这些目录读写文件，确保运行用户有写权限：

```
项目根目录/
├── configs/         # 配置文件（自动生成）
├── images/          # 原图
├── image_cache/     # 缩略图缓存
├── uploads/         # 头像等上传文件
├── logs/            # 应用日志
└── adminInfo/       # 初始管理员密码（仅 seed 时生成）
```

```bash
sudo chown -R www-data:www-data /opt/koharu-backend
sudo chmod -R 755 /opt/koharu-backend
```

## 13. 备份

需要备份两类数据：**数据库** + **文件目录**。

```bash
# 数据库
pg_dump -U nest_user -h localhost -Fc koharu > /backup/koharu_$(date +%F).dump

# 文件（原图/缩略图/头像）
tar -czf /backup/koharu_files_$(date +%F).tar.gz \
  -C /opt/koharu-backend images image_cache uploads
```

建议用 cron 每日执行，并保留最近 N 份。

## 14. 更新发布

```bash
cd /opt/koharu-backend
git pull
pnpm install --frozen-lockfile   # 或 bun install
pnpm run build                   # 或 bun run build

# PM2
pm2 reload koharu-backend

# systemd
sudo systemctl restart koharu-backend
```

> 若本次更新涉及数据库字段/枚举变更，且 `synchronize: false`，需先手工执行 Migration（见常见问题）。

## 15. 健康检查

```bash
# 根路径欢迎页
curl -s http://127.0.0.1:3000/

# Swagger 文档可用性
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api

# 登录冒烟测试（确认返回 accessToken）
curl -s -X POST http://127.0.0.1:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<初始密码>"}'
```

## 16. 上线安全清单

- [ ] 已修改默认 `admin` 密码
- [ ] 已替换 `server.token.key` 为随机密钥
- [ ] `database.postgres.synchronize` 已设为 `false`
- [ ] `configs/`、`adminInfo/` 权限收紧（`chmod 600` 敏感文件）
- [ ] 数据库仅允许内网/本机连接，账号密码为强密码
- [ ] Nginx 已上 HTTPS，3000 端口不暴露公网
- [ ] 已配置定时备份
- [ ] 已配置日志轮转与磁盘告警（`logs/`、`images/` 会持续增长）

## 17. 常见问题

### 启动报「找不到 configs/config.yaml」

程序会在 `process.cwd()` 下查找 `configs/`，请确认在**项目根目录**启动（PM2 的 `cwd`、systemd 的 `WorkingDirectory` 都要指向项目根目录）。

### `bcrypt` / `sharp` 安装失败

通常是缺少编译环境：

```bash
sudo apt-get install -y build-essential python3 make g++
pnpm rebuild bcrypt sharp
```

### 改字段/枚举后表结构没变

`synchronize: false` 时 TypeORM 不会自动改表；且 **Postgres 枚举类型（如 `role`、`visibility`）在 synchronize 下也不会自动更新已存在的枚举**。上线后的 schema 变更请用 Migration 手工执行，例如：

```sql
ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
```

### 图片/头像上传 413 或超时

检查 Nginx `client_max_body_size`、`proxy_read_timeout` 是否足够（见第 10 节），并确认 `upload.maxSize` 与前端一致。

### 每日上传限流按哪个时区重置

按服务器本地时区（`new Date()` 的 `setHours(0,0,0,0)`）计算「当天」。请通过 `TZ` 环境变量（见第 9 节）设置成你期望的时区。

---

部署完成后，Swagger 文档默认在 `http://your-domain.com/api`，OpenAPI YAML 在 `http://your-domain.com/api-yaml`。
