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
- [完整文档](#完整文档-docs)
- [安全与最佳实践](#安全与最佳实践-security--best-practices)
- [License](#license)

---

## 核心特性 (Features)

- **安全认证与授权**：JWT 双 Token（Access + Refresh），配合**五级 RBAC** 与等级守卫（`MinRoleGuard`）；登录同时下发 `HttpOnly` Cookie，供 `<img>`/`<a download>` 这类带不了请求头的场景使用。
- **图片投稿与审核**：
  - 原图与缩略图分离存储（都在上传根目录下：`uploads/images` & `uploads/image_cache`），基于 `sharp` 自动裁剪压缩。
  - **静态加密**：原图与缩略图在磁盘上是 AES-256-GCM 密文，由图库密码派生的密钥保护；改密码时后台重加密、服务不停（`/api/library/*`）。
  - 审核流水线：`pending → approved / rejected`；被拒或已过审图片可**重新投稿一次**，重置为待审核。
  - HMAC-SHA256 签名防盗链下载、MD5 完整性校验（详情返回 `md5`，下载响应头返回 `X-Content-MD5`）。
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
| 不可自审 | 审核员不能审核自己上传的图片或自己提交的头像，返回 403 |

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

- 业务接口：`http://localhost:3000/api/...`（全局前缀 `/api`，例：`GET http://localhost:3000/api/images`）
- API 文档（Swagger UI）：`http://localhost:3000/api-doc`
- OpenAPI YAML：`http://localhost:3000/api-yaml`
- 根路径 `http://localhost:3000/`：托管 `server.frontend_dir` 下的前端产物，非 `/api`、`/api-doc` 的 GET 请求回退到 `index.html`（SPA 路由）

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
  frontend_dir: "./frontend/dist"    # 前端构建产物目录（SPA），挂在根路径
  token:
    key: "default_secret"            # JWT 签名密钥（务必替换）
    timeout: 86400000                # Access Token 有效期（毫秒，1 天）
    refresh_timeout: 691200000       # Refresh Token 有效期（毫秒，8 天）
  cookie_secure: false               # 登录下发的 koharu_token Cookie 是否带 Secure（HTTPS 部署时设 true）
  image_lib:
    path: "./images"                 # 已废弃（仅为兼容旧配置保留）：原图实际写在 upload.dir 下的 images 子目录
    cache_path: "./uploads/image_cache"  # 缩略图缓存目录（必须位于 upload.dir 之内，否则回退为 <upload.dir>/image_cache 并告警）
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

auth:
  login_throttle:
    max_failures: 5                  # 同一用户名在窗口内的失败次数上限
    ip_max_failures: 20              # 同一 IP 在窗口内的失败次数上限（防换用户名撞库）
    window_ms: 900000                # 失败计数窗口（毫秒，15 分钟）
    block_ms: 900000                 # 触发后的封禁时长（毫秒，15 分钟）
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

> 下表路径均省略全局前缀 `/api`，例如 `/images` 的实际请求是 `GET /api/images`。
>
> 所有路径参数 `:id` / `:userId` 必须为 UUID，格式非法（如 `GET /api/images/1`）由 Controller 层的 `ParseUUIDPipe` 直接返回 `400`，不会进入业务逻辑，也不会打到数据库。

### auth（认证）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/auth/public-key` | 获取登录/改密用的 RSA 公钥（`PEM`） | 公开 |
| POST | `/auth/login` | 登录，返回 Access/Refresh Token；失败次数超额返回 `429`（含 `retryAfterMs`） | 公开 |
| POST | `/auth/refresh` | 刷新 Access Token | 公开 |

> 登录响应为 `{ accessToken, refreshToken, expiresIn, user: { id, username, role } }`，`expiresIn` 单位为**毫秒**；`role` 取值是大写的 `SUPER_ADMIN` / `ADMIN` / `MODERATOR` / `USER` / `GUEST`。

### users（用户）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/users` | 注册（默认 USER） | 公开 |
| GET | `/users` | 分页用户列表 | MODERATOR+ |
| GET | `/users/me` | 当前用户信息 | 登录 |
| PATCH | `/users/me/password` | 修改自己密码 | 登录 |
| GET | `/users/:id/public` | 公开资料 | 公开 |
| GET | `/users/:id` | 用户详情 | 本人/上级 |
| PATCH | `/users/:id` | 更新用户信息（用户名/邮箱重复返回 `409`） | 本人/上级 |
| DELETE | `/users/:id` | 删除用户（联动删图片/头像/图集） | 本人/上级 |
| PATCH | `/users/:id/role` | 修改角色 | MODERATOR+（分级受限） |

### images（图片投稿）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/images` | 上传图片（进待审核） | USER+（IP 限 500/天） |
| POST | `/images/:id/review` | 审核图片（仅待审核图片，重复审核返回 `409`） | MODERATOR+ |
| POST | `/images/:id/modify` | 修改图片（重置审核，终身一次） | 本人 |
| GET | `/images` | 图片列表（默认仅已过审；`?status=` 可按状态筛选） | 公开；按状态筛选需 MODERATOR+ |
| GET | `/images/pending` | **待审核队列**（按上传时间正序，含 `id` 与上传者用户名） | MODERATOR+ |
| GET | `/images/my` | 我的投稿（含 `archived` 归档标记，可用 `?status=` 过滤） | 登录 |
| GET | `/images/:id/thumbnail` | 缩略图流 | 已过审公开 / 未过审 本人或 MODERATOR+ |
| GET | `/images/:id/sign` | 生成签名下载链接（返回含 `/api` 前缀的绝对地址，有效期同 `expiresInMs`） | 公开（未过审图片的链接在下载时被拒） |
| GET | `/images/:id/download` | 下载原图（需有效签名；响应头带 `X-Content-MD5`） | 已过审公开 / 未过审 本人或 MODERATOR+ |
| GET | `/images/:id` | 图片详情（不含 `path`/`uploaderIp`/`reviewedBy`，含 `md5`） | 已过审公开 / 未过审 本人或 MODERATOR+ |
| DELETE | `/images/:id` | 删除图片 | 本人/上级 |

> 审核闭环：审核界面先调 `GET /images/pending` 取到待审核图片的 `id`，再调 `POST /images/:id/review`；`GET /images?status=pending` 是同一份数据的通用筛选入口（不排序、不带上传者）。上传者本人可以查看自己待审核/被拒的图片详情与缩略图，否则改稿时无从对照。
>
> 游客可见范围：已过审图片的详情、缩略图、签名链接与原始文件均无需登录；未过审（含图集里因改稿退回待审核的图片）只对审核员及以上与上传者本人可见。所有响应里的 `thumbnailUrl` 都带 `/api` 前缀，可直接作为 `<img src>` 使用。
>
> 凭证携带：图片接口既认 `Authorization: Bearer`，也认登录时下发的 `koharu_token` Cookie（`HttpOnly` + `SameSite=Lax`）。`<img src>`、`<a download>` 无法携带自定义请求头，必须靠 Cookie 才能访问「本人可见但未过审」的图片——否则会出现「自己看自己的投稿 403」。

### library（图库密钥）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/library/status` | 图库是否解锁、密钥版本、重加密进度 | 公开 |
| POST | `/library/password` | 修改图库密码（`{ oldPassword, newPassword }`），触发后台重加密 | ADMIN+ |
| POST | `/library/unlock` | 锁定态下用图库密码解锁（`{ password }`） | ADMIN+ |

> 图库密码是图片静态加密的根，初始化时随机生成并写入 `adminInfo/info.json` 的 `library.password`；数据库里只有 bcrypt 哈希与被密码包裹的数据密钥。改密码不需要停服，详见 [docs/05-config-and-deploy.md](docs/05-config-and-deploy.md)。

### albums（图集归档）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/albums` | 创建图集（可携带标签） | USER+ |
| GET | `/albums` | 图集列表（公开图集 + 自己创建的私有图集） | 公开/可选登录 |
| GET | `/albums/search` | 搜索图集（标题/描述模糊 + 标签全命中） | 公开/可选登录 |
| GET | `/albums/:id` | 图集详情 | 公开 / 本人 / MODERATOR+（私有图集对其余人返回 `404`） |
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
| POST | `/avatars/:userId/review` | 审核头像（仅待审核投稿；响应 `{ message, status, avatar }`，拒绝时 `avatar` 为 `null`） | MODERATOR+ |
| GET | `/avatars/pending` | **待审核头像队列**（含 `userId` 与用户名，按提交时间正序） | MODERATOR+ |
| GET | `/avatars/:userId/pending/image` | 待审核头像图片流（审核前预览） | MODERATOR+ |
| GET | `/avatars/:userId/image` | 当前头像图片流 | 公开（仅已过审） |
| DELETE | `/avatars/:userId` | 删除头像 | 本人/上级 |

### audit-logs（审计日志）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/audit-logs` | 分页查询操作日志（按操作者/动作/时间过滤） | ADMIN+ |

### 响应结构（与 Swagger `/api-doc` 同源）

上表之外的响应体形状，均以 `src/**/dto` 中的 DTO 为准；`/api-doc` 里的 `$ref` 指向同一批类，`/api-yaml` 可导出完整 schema。

| 接口 | 响应体 |
|---|---|
| `POST /images`、`POST /images/:id/modify` | `{ message, image: ImageResponseDto }` |
| `POST /images/:id/review`、`GET /images/:id` | `ImageResponseDto`（不含 `path`/`uploaderIp`/`reviewedBy`，含 `md5`） |
| `GET /images` | `{ data: ImageListItemDto[], total, page, limit, totalPages }` |
| `GET /images/my` | `{ data: MyImageListItemDto[], total, page, limit, totalPages }`（多 `rejectReason`、`archived`） |
| `GET /images/pending` | `{ data: PendingImageDto[], total, page, limit, totalPages }`（多 `username`） |
| `GET /images/:id/sign` | `{ downloadUrl, expiresInMs }` |
| `GET /albums`、`GET /albums/search` | `{ data: AlbumSummaryDto[], total, page, limit, totalPages }` |
| `POST /albums`、`GET/PATCH /albums/:id`、`POST /albums/:id/unlock`、`POST/DELETE /albums/:id/images` | `AlbumDetailDto`（`images` 项含 `thumbnailUrl`） |
| `GET /users` | `{ data: UserListItemDto[], total, page, limit, totalPages }`（不含 `updatedAt`/`deletedAt`） |
| 其余 users 接口 | `UserResponseDto`（`Omit<User, 'password'>`） |
| `GET /audit-logs` | `{ data: AuditLog[], total, page, limit, totalPages }` |
| `POST /avatars/:userId` | `{ message, submission: { id, status, createdAt } }` |
| `POST /avatars/:userId/review` | `{ message, status: 'approved' \| 'rejected', avatar: { id, userId, createdAt } \| null }` |

---

## 完整文档 (Docs)

面向前后端对接与二次开发的详细文档在 [`docs/`](./docs/README.md)：

| 文件 | 内容 |
|---|---|
| [docs/README.md](./docs/README.md) | 索引、五分钟启动、目录结构、全局约定、审核闭环 |
| [docs/01-architecture.md](./docs/01-architecture.md) | 分层、模块装配、请求生命周期、鉴权链、审核状态机、文件存储、审计、后台任务 |
| [docs/02-auth-and-permissions.md](./docs/02-auth-and-permissions.md) | 角色层级、权限矩阵、登录流程、频控、游客可见性、审核规则 |
| [docs/03-api.md](./docs/03-api.md) | 46 个操作的端点表、请求/响应 DTO 字段、curl 示例 |
| [docs/04-data-model.md](./docs/04-data-model.md) | 表结构、枚举、索引、级联与迁移注意 |
| [docs/05-config-and-deploy.md](./docs/05-config-and-deploy.md) | 配置全键、构建启动、日志、图库密码运维、反向代理、上线检查清单 |
| [docs/06-errors.md](./docs/06-errors.md) | 错误体、状态码语义、逐端点错误文案、重试建议 |
| [docs/07-changes.md](./docs/07-changes.md) | 近期改动与已知限制 |
| [docs/openapi.json](./docs/openapi.json) / [docs/openapi.yaml](./docs/openapi.yaml) | 从运行中的服务导出的 OpenAPI 3.0 规格（46 操作 / 28 schema） |

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
7. **边界校验（路径参数）**：所有 `:id` / `:userId` 由 Controller 层的 `ParseUUIDPipe` 校验，格式非法（如 `GET /api/images/1`）直接返回 `400`，不会进入 Service 与数据库——避免非法值触发 PostgreSQL 的 `22P02 invalid input syntax for type uuid` 并被包装成 `500`。客户端请始终使用列表/详情接口返回的 `id`（UUID），不要用数组下标或自增序号。
8. **审核状态机**：图片审核只能作用于当前 `pending` 的图片，重复审核返回 `409`；审核写入以读到的旧状态为条件（`UPDATE ... WHERE id = ? AND status = <旧状态>`），两名审核员同时审同一张图时后提交者收到 `409` 而不是覆盖前者的结论。头像审核同样只接受 `pending` 投稿。
9. **未过审内容可见范围**：未过审（`pending` / `rejected`）的图片详情、缩略图仅上传者本人与 `MODERATOR+` 可见；公开详情统一返回脱敏投影（`ImageResponseDto`），不含 `path`、`uploaderIp`、`reviewedBy`。
10. **登录失败频控**：`POST /auth/login` 按用户名（默认 15 分钟 5 次）与 IP（默认 15 分钟 20 次）双桶计数，超额返回 `429` 并带 `retryAfterMs`，封禁期内不再查库、不再做 bcrypt 比对（也避免借响应差异探测用户名是否存在）。计数在进程内存中，多实例部署时各自计数，需要全局一致请接入 Redis；阈值见 `auth.login_throttle`。
11. **唯一性冲突**：`POST /users` 与 `PATCH /users/:id` 在写入前检查用户名/邮箱是否被占用（含软删除用户，避免撞唯一索引），冲突返回 `409` 而不是 PostgreSQL 约束错误包装成的 `500`。
12. **静态加密（图库密码）**：原图与缩略图以 AES-256-GCM 落盘（文件头 `KHR1` + 版本号），数据密钥由「图库密码 → scrypt → KEK」包裹后存 `library_secrets`。磁盘被拷走也拿不到可读图片；密码本身只写 `adminInfo/info.json`（`0600`），库里只有 bcrypt 哈希。初始密码随首次启动生成，服务会打一条日志；`adminInfo/` 不可写时请立刻抄下日志里的密码。
13. **改密码不停服**：`POST /library/password` 会生成新版本密钥、立即切换活跃版本，再后台分批重加密全部原图与重建缩略图；期间新旧版本都能读，进度见 `GET /library/status` 的 `rotation`。解不开密钥时进入锁定态（`503`），用 `POST /library/unlock`（ADMIN+）恢复。
14. **图片完整性**：`ImageResponseDto` 的 `md5` 与下载响应的 `X-Content-MD5` 都是**明文**的 MD5，前端可在流式下载后自行比对；下载接口也会在服务端校验，不符返回 `500`。

---

## License

Koharu Backend is [MIT licensed](LICENSE).
