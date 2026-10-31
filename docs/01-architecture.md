# 01 架构

## 技术栈

| 项 | 选型 | 备注 |
|---|---|---|
| 运行时 | Node.js 22，ESM（`"type": "module"`） | 源码里的相对导入必须带 `.js` 后缀 |
| 框架 | NestJS 12 | Controller / Service / Guard / Interceptor |
| ORM | TypeORM 1.1 | `autoLoadEntities: true`，`synchronize` 取配置 |
| 数据库 | PostgreSQL | 枚举用 PG 原生 `enum` 类型 |
| 校验 | class-validator 0.15 + `ValidationPipe` | 全局 `transform: true, whitelist: true` |
| 文档 | @nestjs/swagger 12 | `/api-doc`、`/api-doc-json`、`/api-yaml` |
| 图片 | sharp | 缩略图生成、尺寸探测；file-type 做 magic bytes 复检 |
| 日志 | winston + winston-daily-rotate-file | `error/` 与 `combined/` 两路，JSON 落盘 |
| 密码 | bcrypt | 存哈希；传输可加 RSA-OAEP |

## 分层

```text
HTTP ──▶ Controller（路由、Guard 挂载、Swagger 注解、参数 DTO）
          │
          ▼
        Service（业务规则、权限判定、跨表查询、文件读写）
          │
          ▼
        Repository（TypeORM Entity）
          │
          ▼
        PostgreSQL / uploads 目录
```

规则很固定：**Controller 不做业务判断**，`req.user` 直接透传给 Service，由 Service 决定「这个角色能不能看这条数据」。权限判断集中在 `Service`，好处是任何调用路径（HTTP、未来内部调用、脚本）都不会绕过校验。

## 模块装配

`AppModule` 的 imports 顺序即启动顺序：

| 模块 | 职责 | 依赖 |
|---|---|---|
| `ConfigModule`（global） | 加载 `configs/config.yaml`，缺失则写默认值；`deepMerge` 合并 | — |
| `TypeOrmModule.forRootAsync` | 连接 PG，实体自动加载 | ConfigService |
| `AuthModule` | 登录/刷新、`JwtStrategy`、`LoginThrottleService` | `UserModule`、`SecurityModule` |
| `LoggerModule` | winston Logger 实例（全局可用） | ConfigService |
| `FileModule` | 文件落盘、路径越界防护、读删 | **`@Global()`**，其它模块不需要 import |
| `LibraryModule` | 图库密码：密钥材料、加解密、密码轮转 | LibrarySecret、Image、FileModule |
| `AvatarModule` | 头像投稿/审核/图片流 | Avatar、AvatarSubmission、User、`ReviewExemptionModule` |
| `ImageModule` | 图库主链路 | Image、LibraryModule、`ReviewExemptionModule` |
| `AuditModule` | 以 `APP_INTERCEPTOR` 全局注册审计拦截器 | AuditLog |
| `AlbumModule` | 图集 + 标签（`TagController` 也在这一模块里） | Album、Tag、Image |
| `CleanupModule` | 定时清理过期软删用户 | User |
| `ReviewExemptionModule` | 自审赦免名单：管理员把审核员加进/移出名单 | User |
| `SeedModule` | 首次启动建主管理员、初始化图库密码 | User、LibraryModule |

`UserModule` 不在 `AppModule` 里，而是被 `AuthModule` 引入（注册路由的同时供 `AuthService` 复用 `UserService`）。加新模块时注意这一点：只 import 而不使用，Nest 一样会注册其 controller。

## 请求生命周期

```text
请求
 │
 ├─ 1. 全局前缀：/api 之外的路径不进路由（GET 会回退到前端 index.html）
 ├─ 2. Guard 链
 │     · JwtAuthGuard        必须带有效 token，否则 401
 │     · OptionalJwtAuthGuard 有 token 就解析，无 token / token 非法都按游客放行
 │     · MinRoleGuard        读 req.user.role，与 @MinRole(x) 比较，不足 403
 ├─ 3. ValidationPipe        whitelist 剔除未声明字段；类型/长度/枚举校验失败 → 400
 ├─ 4. Controller            ParseUUIDPipe 校验 :id；调用 Service
 ├─ 5. Service               业务规则 + 权限判定，读写 DB 与 uploads
 └─ 6. AuditLogInterceptor   非 GET/HEAD/OPTIONS 的请求写一条 audit_logs
```

顺序上有个容易踩的点：**Guard 先于参数校验**。所以未登录访问 `GET /images/pending?page=0` 得到的是 `401`，而不是参数校验的 `400`——写测试用例时别把它当成参数校验失灵。

### 鉴权链

```text
Authorization: Bearer <token>
   └─▶ JwtStrategy.validate(payload)
         └─▶ UserService.findByIdForAuth(payload.sub)   // 每次请求都回库
               └─▶ req.user = { id, username, role }
```

JWT 的 payload 只有 `sub`（用户 id）和 `purpose`（`access` / `refresh` / `reauth`，旧令牌没有该字段按 access 处理），**角色永远来自数据库**。原因是角色可以被管理员随时改，把 role 塞进 token 会让降级在 token 过期前不生效，也会让伪造成为可能。代价是每个受保护请求多一次主键查询。`JwtStrategy` 会拒绝非 `access` 的令牌，再认证票据与刷新令牌不能混用作访问凭证。

`OptionalJwtAuthGuard` 继承同一个策略，只是把 `handleRequest` 改成 `return user || null`——token 过期或乱填都不报错，按游客处理。公开接口用它是为了「登录了能看到更多」：比如 `GET /images/{id}` 对游客只看已过审，对审核员能看待审图。

## 审核状态机

图片与头像共用 `ImageStatus` / `AvatarStatus` 两种枚举，取值都是 `pending / approved / rejected`。

### 图片

```text
             upload
   (无) ─────────────▶ pending
                          │
            approve       │        reject（必须给 reason）
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
    approved ◀── 只能由 pending 迁入 ──▶ rejected
        │                                   │
        └──────── modify（仅本人、仅一次）────┘
                          │
                          ▼
                       pending（editCount += 1）
```

约束都在 `ImageService`：

- 审核只接受 `approved` / `rejected` 入参；把 `pending` 传给审核接口是 400。
- 审核带并发保护：以读到的旧状态作为 `UPDATE ... WHERE id = ? AND status = ?` 的条件，`affected = 0` 说明被别的审核员抢先改过，返回 **409**；重复审成同一状态也是 409。
- 不能审自己上传的图片（403）：`ADMIN` / `SUPER_ADMIN` 天然豁免，被加入自审赦免名单（`users.reviewExempt`）的审核员同样放行；豁免判定由 `ReviewExemptionService.isSelfReviewExempt()` 统一提供，头像审核复用同一套。
- 改稿仅限上传者本人，且 `editCount` 已为 1 时拒绝；改稿会删掉旧原图与旧缩略图、写入新文件，状态回到 `pending`。

### 头像

头像比图片多一层「当前头像」：`avatars` 表每个用户最多一行（`userId` 唯一），`avatar_submissions` 是投稿队列。

```text
submit ──▶ avatar_submissions(pending)
                │
   approve ─────┴───── reject（必须给 reason）
      │                    │
      ▼                    ▼
 写入/替换 avatars     删除投稿文件与记录
 （旧文件同时删除）      当前头像保持不变
```

- 同一用户同时只能有一条 pending 投稿，重复提交 409。
- 不能审自己提交的头像（403），豁免规则与图片一致：ADMIN+ 天然豁免，审核员在自审赦免名单内时放行。
- 拒绝时**不落库拒绝原因**：`avatar_submissions` 没有 `rejectReason` 列。原因只写进审计日志。这是已知限制，要补得加列并写迁移（生产 `synchronize=false`）。
- 通过时返回 `{ message, status, avatar: { id, userId, createdAt } }`；拒绝时 `avatar` 为 `null`，两种结果形状一致，前端不用分支。

## 文件存储

配置项 `upload.dir`（默认 `./uploads`）是存储根，数据库里只存相对路径。

```text
uploads/
├── images/<uuid>.<ext>          原图（按 uuid 命名，原始文件名只存 DB）
├── avatars/<uuid>.<ext>         头像：已生效的与待审投稿同目录，由 DB 记录区分
└── image_cache/<uuid>.webp|jpg  缩略图缓存，可随时删（首次访问时重建）
```

目录名是写死的子目录名：`FileService.saveFile(file, 'images')`、`saveFile(file, 'avatars')`；缩略图落在 `server.image_lib.cache_path`，且必须位于 `upload.dir` 之内，否则启动时会回退到 `<upload.dir>/image_cache` 并打警告——否则会出现「写在 A、读在 B」的永久 500。

| 环节 | 行为 |
|---|---|
| 落盘 | `FileService.saveFile`：校验大小（`upload.maxSize`，默认 20 MB）→ 扩展名白名单 → `file-type` 复检 magic bytes → `randomUUID` 命名 |
| 路径安全 | `resolveSafePath` 拒绝 `\0` 与 `..` 越界，所有读写都过这一层 |
| 缩略图 | 首次请求时生成（png/webp → webp q80，其余 → jpeg q80，宽 800 不放大），随后命中缓存；原图丢失或 MD5 不符返回 500 |
| 下载 | 走签名链接：`HMAC-SHA256("<imageId>:<expires>", server.token.key)`，`expires` 毫秒时间戳；过期 400、签名不符 400 |
| 删除 | 删 DB 记录 + 原图 + 缩略图；图集里只删关联，不删文件 |

`thumbnailUrl` 一律带 `/api` 前缀（`src/common/constants.ts` 的 `API_PREFIX`），前端可以直接当 `<img src>` 用，不要自己拼。

## 静态加密（图库密码）

原图与缩略图在磁盘上**不是明文**，这是为了「拿到服务器磁盘也看不到图」：

```text
原图文件 = "KHR1" | version(1B) | iv(12B) | tag(16B) | AES-256-GCM(ciphertext)
```

| 环节 | 实现 |
|---|---|
| 算法 | AES-256-GCM（`src/library/library-crypto.service.ts`），每个文件独立 IV，头里带版本号 |
| 数据密钥 | 32 字节随机值，不落明文库；用 `scrypt(图库密码, salt, 32)` 派生的 KEK 包裹后存 `library_secrets.keys` |
| 密码本身 | 只在 `adminInfo/info.json` 的 `library.password`（权限 0600），库里只有 bcrypt 哈希用于校验 |
| 兼容旧数据 | 没有 `KHR1` 头的文件按「升级前的明文」处理；启动后 `encryptLegacyPlaintext()` 会后台把它们补加密 |
| 改密码 | `activeVersion` +1，新旧密钥并存，后台分批重加密，服务不停；详见 `05-config-and-deploy.md` §6 |
| 锁定态 | 进程启动时解不开密钥就进入锁定态：缩略图/下载/上传返回 `503`，`POST /api/library/unlock`（ADMIN+）解锁 |
| 对外行为 | 接口返回的始终是解密后的明文；`X-Content-MD5` 是**明文**的 MD5 |

上传流程因此变成：`saveFile` 落盘 → `sharp` 读元数据（用内存里的 buffer，不读盘）→ 生成缩略图（写盘前加密）→ `sealFile` 把刚落盘的原图就地替换成密文 → 写入 DB。缩略图自愈时先 `decrypt` 原图再重建。

## 鉴权凭证的四种携带方式

| 方式 | 谁在用 | 说明 |
|---|---|---|
| `authorization: Bearer <accessToken>` | 前端 fetch、curl、Swagger | 主路径 |
| `koharu_token` Cookie | `<img src>`、`<a download>`、iframe | 登录/刷新时下发，`HttpOnly` + `SameSite=Lax`（HTTPS 下再开 `server.cookie_secure`）。浏览器原生请求带不了自定义头，没有它就拿不到「本人可见但未过审」的图 |
| `?access_token=<accessToken>` | 前后端分离、Cookie 被 `SameSite` 挡住时的图片流 | 提取器链的最后一级兜底。Token 会出现在访问日志与 Referer 里，只建议用于图片/头像这类 GET 流 |
| 下载签名 | `GET /images/:id/download` | `signature` + `expires`，与角色鉴权叠加（未过审仍会二次校验） |

`JwtStrategy` 的 `jwtFromRequest` 是「Bearer → Cookie → 查询参数」的提取器链；Cookie 解析手写在 `src/auth/strategies/jwt.strategy.ts` 里，没有引入 `cookie-parser`。

`OptionalJwtAuthGuard` 区分两种情况：**完全没带凭证**才降级为游客（`req.user = null`）；**带了但无效**（过期、伪造、用户已删）直接抛 `401 登录状态已失效，请重新登录`。否则前端只会看到 `403`，误判成权限不足而去猜角色。

## 审计

`AuditLogInterceptor` 全局注册，`GET/HEAD/OPTIONS` 不记，其余请求在响应后写一行 `audit_logs`：

- `action` 形如 `POST /images/:id/review`（用路由模板而不是真实路径，方便聚合统计）。
- `actorId/actorUsername/actorRole` 是快照，用户改名后历史日志仍显示当时的名字。
- 登录请求额外写 `detail = { username }`。判断用的是 `req.originalUrl.endsWith('/auth/login')`——不能用 `req.path`，它带 `/api` 前缀，写死比较会永远不成立。
- 写日志失败不会影响主请求。

## 后台任务

| 任务 | 触发 | 行为 |
|---|---|---|
| Seed | `onModuleInit` | 有 `admin` 就确保是 `SUPER_ADMIN`；没有就建一个并写 `adminInfo/info.json` |
| Cleanup | 启动即跑一次，之后每 `cleanup.interval_ms`（默认 24h） | 硬删除 `deletedAt` 早于 `retention_ms`（默认 14 天）的用户及其关联文件 |

Cleanup 在 `onModuleInit` 会立即执行一次，且**会真删数据**。本地起服务做冒烟测试前先确认库里没有被软删超过 14 天的账号。

## 设计取舍与已知限制

| 项 | 现状 | 影响 |
|---|---|---|
| 登录频控 | 进程内 `Map` | 多实例部署时各自计数，等效阈值放大；要全局一致需换 Redis |
| 上传限流 | 按 IP + 自然日计 500 张 | 多实例同样各自计数；共享出口 IP 的用户会互相挤占 |
| 头像拒绝原因 | 不落库 | 用户看不到被拒原因，只有审计日志里有 |
| 生产建表 | `synchronize: false` | 加字段必须写迁移；本仓库未内置 migration 目录 |
| 游客判定 | token 非法即按游客 | 过期 token 访问公开接口不会 401，会少返回字段 |
| 删除用户 | 软删除 + 定时硬删 | 软删期间邮箱/用户名仍占唯一索引，注册会撞 409 |

改动这些之前先看 [04-data-model.md](04-data-model.md) 与 [06-errors.md](06-errors.md)，避免只改一处漏掉另一处。
