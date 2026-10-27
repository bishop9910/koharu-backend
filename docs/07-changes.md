# 07 · 近期改动

面向已经在对接本服务的客户端：按「是否影响现有调用」分组。版本号未打 tag，以下按提交时间从近到远。

## 1. 需要适配的变更

### 1.1 新增接口

| 接口 | 权限 | 用途 |
|---|---|---|
| `GET /api/images/pending` | MODERATOR+ | 待审核图片队列（按上传时间正序，含 `id` 与上传者 `username`） |
| `GET /api/avatars/pending` | MODERATOR+ | 待审核头像队列 |
| `GET /api/avatars/{userId}/pending/image` | 本人 或 MODERATOR+ | 待审核头像图片流（提交后可立刻预览自己那张） |
| `GET /api/auth/public-key` | 公开 | 取 RSA 公钥，用于加密登录密码 |
| `GET /api/library/status` | 公开 | 查询图库是否已解锁、密钥版本、重加密进度 |
| `POST /api/library/password` | ADMIN+ | 修改图库密码并触发后台重加密 |
| `POST /api/library/unlock` | ADMIN+ | 锁定态下用图库密码解锁 |

### 1.2 响应形状变化

| 位置 | 变化 | 动作 |
|---|---|---|
| 所有含 `thumbnailUrl` 的响应 | 值从 `/images/{id}/thumbnail` 变为 **`/api/images/{id}/thumbnail`** | 前端不要再手工拼前缀 |
| `GET /api/images/{id}` | 不再返回完整实体，改为 `ImageResponseDto`（去掉 `path`、`uploaderIp`、`reviewedBy`；`md5` 保留） | 按 DTO 字段取；`md5` 可用于完整性校验 |
| `GET /api/images`、`/my` | 同样是投影后的 DTO；`/my` 额外有 `archived`、`rejectReason` | 按 DTO 字段取 |
| `GET /api/images/my` | 新增可选 `status` 过滤 | 可用于「我的待审/被拒」 |
| `GET /api/images` | 新增可选 `status` 过滤（MODERATOR+，否则 403） | |
| `POST /api/images/{id}/review` | 返回 `ImageResponseDto`（原来是实体） | |
| `POST /api/avatars/{userId}/review` | 统一返回 `{ message, status, avatar }`；拒绝时 `avatar: null` | 原来拒绝只回 `{ message }`，通过回 `Avatar` |
| `GET /api/albums`、`/search` | 返回值结构不变，字段为 `AlbumSummaryDto` | |
| `GET /api/albums/{id}` | `images[]` 对非 staff、非本人的访问者只含**已过审**图片 | 私有图集里未过审的图不再出现 |
| `GET /api/users` | 每项为 `UserListItemDto`（没有 `updatedAt` / `deletedAt`），新增 `avatarUrl` | 头像地址不必再手工拼前缀 |
| `GET /api/users/{id}/public` | 新增 `avatarUrl`（`avatar` 保持 `{ path }` 不变） | |
| `POST /api/avatars/{userId}` | 响应 `submission` 新增 `imageUrl` | 提交后可直接用 `<img src>` 预览待审头像 |
| `POST /api/auth/login` | 超额失败返回 `429`，body 含 `retryAfterMs` | 加倒计时提示 |

### 1.3 鉴权行为变化

| 接口 | 之前 | 现在 |
|---|---|---|
| `GET /api/images/{id}/sign` | 必须登录，未过审也照签 | **公开**，但未过审且非本人/审核员直接 `403` |
| `GET /api/images/{id}/download` | 必须登录 | **公开**（先验签名，再按 `canPreview` 校验身份） |
| `GET /api/images` | 无 guard | 可选认证（带 token 才允许 `status` 过滤） |
| `GET /api/avatars/{userId}/pending/image` | MODERATOR+ | 本人 或 MODERATOR+ |
| `POST /api/images/{id}/review` | 可自审 | **自审 403** |
| `POST /api/avatars/{userId}/review` | 可自审 | **自审 403** |
| 任一 `OptionalJwtAuthGuard` 端点 | 凭证失效时静默按游客处理（表现为 403） | 凭证失效返回 `401`；只有完全不带凭证才是游客 |

### 1.4 新增的错误

| 码 | 触发 | 说明 |
|---|---|---|
| `429` | 登录失败超限 | `retryAfterMs` |
| `409` | 重复审核（目标状态与当前相同） | 幂等调用方需处理 |
| `409` | 审核期间状态被他人改变 | 条件更新，`affected = 0` |
| `409` | `PATCH /users/{id}` 用户名/邮箱冲突 | 原来可能 500 |

## 2. 修复的缺陷

| 问题 | 影响 | 修复位置 |
|---|---|---|
| 待审核图片没有 id 入口 | 审核接口要 UUID，但没有任何接口能产出它 | 新增 `/images/pending` |
| 待审核头像无法审核 | 只能靠猜 `userId`，且看不到待审图 | 新增两个头像接口 |
| 图片详情泄露内部字段给游客 | `path` / `uploaderIp` / `reviewedBy` | `ImageResponseDto`（`md5` 按需保留，供完整性校验） |
| 上传者看不到自己未过审的图 | 详情/缩略图对本人 403 | `canPreview` 放行上传者 |
| 已过审图片重复审核可随意翻转 | 审核员可把 approved 改成 rejected | 状态相同 409 + 条件更新 |
| 签名下载链接缺 `/api` 前缀 | 链接必然 404 | `generateSignedUrl` 用 `API_PREFIX` |
| `GET /images/:id/sign` 对不存在 id 也签 | 前端拿到必然失败的链接 | 前置存在性检查，404 |
| 审计日志的登录明细从未落库 | `detail` 永远为空 | 用 `endsWith('/auth/login')` 判断 |
| 图集列表用 `where` 覆盖前置条件 | 可见性与后续筛选互相覆盖 | 改 `andWhere` |
| 登录无频控 | 可无限撞库 | 用户名 + IP 双桶，5/20 次 |
| 改邮箱撞唯一索引 500 | 客户端拿不到可读错误 | 预检 → 409 |
| 图集详情泄露未过审图片 | 私有图集里待审图被他人看到 | `toDetailDto` 按角色过滤 |
| 所有 `thumbnailUrl` 缺 `/api` 前缀 | 直接当 `<img src>` 用必然 404 | 统一用 `API_PREFIX` 拼接 |
| 获取本人的待审投稿返回 403 | 前端 `<img>` 带不了 `Authorization`，本人也看不到自己的图 | 登录/刷新下发 `koharu_token` Cookie，`JwtStrategy` 增加 Cookie 与 `?access_token=` 提取器 |
| 待审头像只有审核员能看 | 用户提交完头像后看不到自己刚传的那张 | `GET /avatars/:userId/pending/image` 放行本人；提交响应新增 `submission.imageUrl` |
| 凭证过期被静默降级成游客 | 前端只看到 403，误判成权限不足 | `OptionalJwtAuthGuard`：无凭证才是游客，有凭证但无效返回 401 |
| `GET /images/:id/sign` 给未过审图片也签链接 | 先给可用的 URL，下载时才 403 | 签名前先按 `canPreview` 鉴权，直接 403 |
| 待审头像队列的 `imageUrl` 缺 `/api` | 直接当 `<img src>` 用 404 | 用 `API_PREFIX` 拼接 |
| 用户公开资料只给 `avatar.path` | 前端得自己拼头像地址，容易漏前缀 | 返回里加 `avatarUrl`（`avatar` 保持原样） |

## 2.1 图库密码与静态加密（本轮新增）

| 变更 | 说明 |
|---|---|
| 新增 `library_secrets` 表 | 全库一行；只存 scrypt 盐、bcrypt 哈希、被密码包裹的数据密钥，密码本体不落库 |
| 新增 `/api/library/status`、`/library/password`、`/library/unlock` | 见 [03 §1.8](03-api.md#18-图库密钥-apilibrary)；改密码与解锁都要 ADMIN+ |
| 图片落盘改为 AES-256-GCM 密文 | 文件头 `KHR1` + 版本号；旧明文文件启动后后台补加密 |
| 改密码不停服 | `activeVersion` +1，新旧密钥并存，后台分批重加密；进度在 `/library/status` 的 `rotation` |
| `ImageResponseDto` 增加 `md5` | 前端可在下载后做完整性校验；`/download` 同时返回 `X-Content-MD5` 响应头 |
| 锁定态 | 解不开密钥时缩略图/下载/上传返回 `503`，需 ADMIN+ 调 `/library/unlock` |

## 2.2 OpenAPI 规格重新导出

`docs/openapi.json` 与 `docs/openapi.yaml` 已从运行中的服务重新导出，与当前实现一致：**35 个 path / 46 个 operation / 28 个 schema**，`components.securitySchemes` 为 `bearer` + `koharu_token`（cookie），缩略图 / 签名 / 下载三个图片流接口另外声明了可选 `?access_token=` 参数，`GET /api/avatars/{userId}/pending/image` 的 `security` 为「Cookie 或 Bearer 二者之一」。改了 DTO 或 controller 之后必须重导，步骤见 [README · 重新导出 OpenAPI 规格](README.md#重新导出-openapi-规格)。

## 3. 未做 / 已知限制

| 项 | 说明 |
|---|---|
| 头像拒绝原因不持久化 | `avatar_submissions` 没有 `rejectReason` 列，只写进审计日志；要展示给用户必须加列（见 [04 §6](04-data-model.md#6-生产环境的迁移注意)） |
| `GET /users` 不按层级过滤 | MODERATOR 也能拿到 ADMIN/SUPER_ADMIN 的邮箱；只靠 `@MinRole(MODERATOR)` 拦入口 |
| 登录频控是进程内存 | 多实例部署时阈值被放大；要全局一致需 Redis |
| 没有 `trust proxy` | 挂 Nginx 后 `req.ip` 全是代理地址，频控与 `uploaderIp` 失真（见 [05 §5](05-config-and-deploy.md#5-反向代理注意事项)） |
| 没有邮件验证 | `emailVerified` 默认 `true`，字段只是预留 |
| 没有分页游标 | 一律 `page`/`limit` 偏移分页，深翻页有性能上限 |
| 仓库无迁移文件 | 生产 `synchronize=false`，改表需手工 SQL |
| 没有 CORS 配置 | 前后端同源部署；若前端独立域名需自行加 `app.enableCors()` |
