<p align="center">
  <img
    src="./image/icon.png"
    alt="Koharu Logo"
    width="160"
    height="134"
  />
</p>

<h1 align="center">Koharu Backend</h1>

<p align="center">
  一个基于 NestJS 构建的渐进式、高安全、可扩展的图库后端服务。
  <br />
  内置完整的 JWT 认证、五级 RBAC 权限体系、图片投稿与审核、图集归档、审计日志及严格的文件安全防护。
</p>

<p align="center">
  <a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/badge/Node.js-v22.x-green.svg" alt="Node Version" /></a>
  <a href="https://nestjs.com" target="_blank"><img src="https://img.shields.io/badge/NestJS-v12.x-red.svg" alt="NestJS Version" /></a>
  <a href="https://pnpm.io" target="_blank"><img src="https://img.shields.io/badge/Package%20Manager-pnpm-orange.svg" alt="Package Manager" /></a>
  <a href="https://www.typescriptlang.org" target="_blank"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" /></a>
  <a href="https://www.postgresql.org" target="_blank"><img src="https://img.shields.io/badge/PostgreSQL-15+-336791.svg" alt="PostgreSQL" /></a>
</p>

---

## 目录

- [核心特性](#核心特性-features)
- [权限体系](#权限体系-rbac)
- [技术栈](#技术栈-tech-stack)
- [快速开始](#快速开始-quick-start)
- [配置说明](#配置说明-configuration)
- [默认管理员](#默认管理员-default-admin)
- [模块与接口概览](#模块与接口概览-api)
- [安全与最佳实践](#安全与最佳实践-security--best-practices)
- [License](#license)

---

## 核心特性 (Features)

- **安全认证与授权**：JWT 双 Token（Access + Refresh），配合**五级 RBAC** 与等级守卫（`MinRoleGuard`）。
- **图片投稿与审核**：
  - 原图与缩略图分离存储（`/images` & `/image_cache`），基于 `sharp` 自动裁剪压缩。
  - 审核流水线：`pending → approved / rejected`；被拒或已过审图片可**重新投稿一次**，重置为待审核。
  - HMAC-SHA256 签名防盗链下载、MD5 完整性校验。
  - 同一 IP 每天上传上限 500 张（ADMIN/SUPER_ADMIN 不限）。
- **图集归档 (Album)**：
  - 用户可创建图集，归档**已过审**图片，支持标题/描述/标签/可见性。
  - 可见性 `public/private`；管理员可将图集改为私有并锁定（本人不可改），也可通过专用接口解锁。
  - 图集搜索：标题/描述模糊匹配 + 多标签「全部命中」。
- **标签 (Tag)**：审核员及以上可创建，用户创建/编辑图集时可携带。
- **头像审核**：头像同样走审核流水线，过审成为当前头像，拒绝则作废并回退到上一个头像。
- **审计日志 (Audit Log)**：DB 持久化的操作日志，记录写操作的执行者、动作、IP、状态码、耗时等，供管理员后台查询。
- **定期清理 (Cleanup)**：软删除超过 2 周的用户会被彻底从数据库删除（可配置周期）。
- **生产级文件安全**：Magic Bytes 校验、路径遍历防护、空字节拦截、上传/删除联动清理磁盘文件。
- **健壮的数据层**：PostgreSQL + TypeORM，UUID 主键、软删除、级联清理。
- **配置驱动**：基于 `@nestjs/config` 的 YAML 集中式配置，**老配置缺失字段自动回退默认值**（向后兼容）。
- **自动初始化 (Auto-Seed)**：启动时自动创建唯一超级管理员 `admin`。

---

## 权限体系 (RBAC)

角色等级（从高到低）：

```
SUPER_ADMIN > ADMIN > MODERATOR > USER > GUEST
```

- `GUEST`：未登录（无 Token），仅可访问公开接口。
- `USER`：默认注册角色。
- `MODERATOR`：审核员，可审核图片/头像，可管理 USER/GUEST。
- `ADMIN`：管理员，可管理 MODERATOR/USER/GUEST，不能管理其他 ADMIN。
- `SUPER_ADMIN`：系统唯一超级管理员，仅 seed 创建的 `admin`，可管理所有人。

**关键约束**：

| 约束 | 说明 |
|---|---|
| 角色不可自改 | 任何人（含超管）不能修改自己的角色，降级也不行 |
| 超管不可删 | 超级管理员账号不可被删除（防止系统锁死） |
| 超管用户名不可改 | seed 依赖字面量 `admin` 识别主管理员 |
| 密码/用户名仅本人 | 任何人不能修改他人密码与用户名 |
| 角色授予分级 | SUPER_ADMIN 可授 ADMIN/MODERATOR/USER/GUEST；ADMIN 可授 MODERATOR/USER/GUEST；MODERATOR 只能授 USER/GUEST |

---

## 技术栈 (Tech Stack)

- **Runtime**: Node.js (ESM Mode)
- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Package Manager**: pnpm
- **Validation**: class-validator, class-transformer
- **Security**: bcrypt, passport-jwt, crypto, sharp, file-type
- **Logging**: winston, winston-daily-rotate-file
- **Docs**: @nestjs/swagger (Swagger UI + YAML)

---

## 快速开始 (Quick Start)

### 1. 环境准备

- [Node.js](https://nodejs.org/)（推荐 v20.x 或 v22.x）
- [pnpm](https://pnpm.io/)（`npm install -g pnpm`）
- [PostgreSQL](https://www.postgresql.org/)（推荐 v15+）

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置

复制/修改 `configs/config.yaml`（首次运行会自动生成默认配置，缺失字段自动回退默认值）：

```yaml
database:
  postgres:
    host: "localhost"
    port: 5432
    username: "your_username"
    password: "your_password"
    database: "koharu"
    synchronize: true   # !首次启动设为 true 以自动建表，之后请改为 false
    logging: false

server:
  port: 3000
  token:
    key: "请替换为安全的随机字符串"
    timeout: 86400000            # Access Token 有效期，1 天
    refresh_timeout: 691200000   # Refresh Token 有效期，8 天
```

> 完整配置项见 [配置说明](#配置说明-configuration)。

### 4. 启动项目

```bash
# 开发模式（热重载）
pnpm run start:dev

# 生产模式（需先执行 pnpm run build）
pnpm run build
pnpm run start:prod
```

启动后：

- API 文档（Swagger UI）：`http://localhost:3000/api`
- OpenAPI YAML：`http://localhost:3000/api-yaml`

---

## 配置说明 (Configuration)

所有配置集中在 `configs/config.yaml`（首次运行自动生成，`src/common/config/default.ts` 为默认值）。

```yaml
database:
  postgres:
    host: "localhost"
    port: 5432
    username: "your_username"
    password: "your_password"
    database: "koharu"
    synchronize: false     # 生产环境务必 false，改用 Migration
    logging: false

server:
  port: 3000
  token:
    key: "default_secret"            # JWT 签名密钥（务必替换）
    timeout: 86400000                # Access Token 有效期（毫秒，1 天）
    refresh_timeout: 691200000       # Refresh Token 有效期（毫秒，8 天）
  image_lib:
    path: "./images"                 # 原图存储目录
    cache_path: "./image_cache"      # 缩略图缓存目录
    cache_time: 86400000             # 签名下载链接有效期（毫秒）
    signature:
      expire_in: 86400000            # 签名过期时间（毫秒）

upload:
  dir: "./uploads"                   # 上传根目录
  avatarDir: "./uploads/avatars"     # 头像子目录
  maxSize: 20971520                  # 单文件大小上限（20MB）
  allowedTypes:                      # 允许的 MIME 类型
    - image/jpeg
    - image/png
    - image/webp
    - image/gif

logger:
  level: info
  dir: "./logs"
  maxSize: "20m"
  maxDays: "14d"
  enableConsole: true

cleanup:
  retention_ms: 1209600000           # 软删除保留时长（毫秒，2 周）
  interval_ms: 86400000              # 清理执行周期（毫秒，1 天）
```

> **向后兼容**：配置系统会把 `config.yaml` 与默认配置做深度合并，yaml 中缺失的字段自动回退默认值，已存在的字段（含你手动改过的）不会被覆盖。新增配置项时只需更新 `default.ts`，老 config 无需重建。

---

## 默认管理员 (Default Admin)

首次启动时，`SeedService` 会自动创建唯一超级管理员：

- **用户名**: `admin`
- **密码**: 随机生成的 16 位 hash
- **角色**: `SUPER_ADMIN`

> **安全警告**：请在生产部署前立即修改此默认密码。忘记初始密码可查看启动日志或 `adminInfo/info.json`。

---

## 模块与接口概览 (API)

### auth（认证）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/auth/login` | 登录，返回 Access/Refresh Token | 公开 |
| POST | `/auth/refresh` | 刷新 Access Token | 公开 |

### users（用户）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/users` | 注册（默认 USER） | 公开 |
| GET | `/users` | 分页用户列表 | MODERATOR+ |
| GET | `/users/me` | 当前用户信息 | 登录 |
| PATCH | `/users/me/password` | 修改自己密码 | 登录 |
| GET | `/users/:id/public` | 公开资料 | 公开 |
| GET | `/users/:id` | 用户详情 | 本人/上级 |
| PATCH | `/users/:id` | 更新用户信息 | 本人/上级 |
| DELETE | `/users/:id` | 删除用户（联动删图片/头像/图集） | 本人/上级 |
| PATCH | `/users/:id/role` | 修改角色 | MODERATOR+（分级受限） |

### images（图片投稿）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/images` | 上传图片（进待审核） | USER+（IP 限 500/天） |
| POST | `/images/:id/review` | 审核图片 | MODERATOR+ |
| POST | `/images/:id/modify` | 修改图片（重置审核，终身一次） | 本人 |
| GET | `/images` | 已过审图片列表 | 公开 |
| GET | `/images/my` | 我的投稿（含 `archived` 归档标记） | 登录 |
| GET | `/images/:id/thumbnail` | 缩略图流 | 已过审公开 / 未过审 MODERATOR+ |
| GET | `/images/:id/sign` | 生成签名下载链接 | USER+ |
| GET | `/images/:id/download` | 下载原图 | USER+ |
| GET | `/images/:id` | 图片详情 | 已过审公开 / 未过审 MODERATOR+ |
| DELETE | `/images/:id` | 删除图片 | 本人/上级 |

### albums（图集归档）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/albums` | 创建图集（可携带标签） | USER+ |
| GET | `/albums` | 图集列表（可见性过滤） | 公开/可选登录 |
| GET | `/albums/search` | 搜索图集（标题/描述模糊 + 标签全命中） | 公开/可选登录 |
| GET | `/albums/:id` | 图集详情 | 可见性过滤 |
| PATCH | `/albums/:id` | 修改图集信息 | 本人/上级 |
| POST | `/albums/:id/unlock` | 解锁被锁定的图集 | ADMIN+ |
| DELETE | `/albums/:id` | 删除图集（不删图片） | 本人/上级 |
| POST | `/albums/:id/images` | 归档图片（仅已过审） | 本人/上级 |
| DELETE | `/albums/:id/images` | 移除归档图片 | 本人/上级 |

### tags（标签）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/tags` | 标签列表 | 公开 |
| POST | `/tags` | 创建标签 | MODERATOR+ |

### avatars（头像）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/avatars/:userId` | 提交头像（进待审核） | 本人 |
| POST | `/avatars/:userId/review` | 审核头像 | MODERATOR+ |
| GET | `/avatars/:userId/image` | 当前头像图片流 | 公开（仅已过审） |
| DELETE | `/avatars/:userId` | 删除头像 | 本人/上级 |

### audit-logs（审计日志）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/audit-logs` | 分页查询操作日志（按操作者/动作/时间过滤） | ADMIN+ |

---

## 安全与最佳实践 (Security & Best Practices)

1. **文件上传防护**：`FileService` 统一做大小限制、MIME 白名单与 Magic Bytes 校验，防止恶意文件上传。
2. **权限双重校验**：Controller 层 `JwtAuthGuard + MinRoleGuard` 拦截，Service 层再按等级做二次业务校验。
3. **密码安全**：`bcrypt` 加盐哈希存储，API 响应统一脱敏（`UserResponseDto` 剔除 password）。
4. **认证与授权分层**：`JwtAuthGuard` 负责「你是谁」，`MinRoleGuard` 负责「你够不够格」，`OptionalJwtAuthGuard` 用于「游客默认放行、登录后多给权限」。
5. **生产环境配置**：
   - 将 `database.postgres.synchronize` 设为 `false`，改用 TypeORM Migration 管理表结构。
   - 替换 `server.token.key` 为安全的随机字符串。
   - 立即修改默认 `admin` 密码。
6. **枚举变更注意**：Postgres 枚举（如 `role`、`visibility`）在 `synchronize` 下不会自动修改已存在的枚举类型，上线后请用 Migration 处理枚举/字段变更。

---

## License

Koharu Backend is [MIT licensed](LICENSE).
