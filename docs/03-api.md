# 03 · 接口参考

本文按模块列出全部 **49 个操作**。机器可读版本见 [openapi.json](openapi.json) / [openapi.yaml](openapi.yaml)（由运行中的服务导出，与本表同源）。

- 接口前缀、UUID 要求、分页、错误体等全局约定见 [README.md](README.md#全局约定)。
- 权限层级与矩阵见 [02-auth-and-permissions.md](02-auth-and-permissions.md)。
- 各端点可能返回的错误码见 [06-errors.md](06-errors.md)。

---

## 1. 端点总表

### 1.1 应用

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| GET | `/api` | 公开 | `string`（欢迎语，可用于存活探测） |

### 1.2 认证 `/api/auth`

| 方法 | 路径 | 权限 | 成功响应 | 说明 |
|---|---|---|---|---|
| GET | `/api/auth/public-key` | 公开 | `{ publicKey: string }` | RSA 公钥（PEM），用于登录/改密时加密密码 |
| POST | `/api/auth/login` | 公开 | `LoginResponse` | 失败次数超额返回 `429`（含 `retryAfterMs`） |
| POST | `/api/auth/refresh` | 公开 | `{ accessToken, expiresIn }` | 用 refreshToken 换新的 access token |

`LoginResponse`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `accessToken` | string | JWT，HS256，payload 只有 `{ sub, iat, exp }` |
| `refreshToken` | string | 独立密钥签发的刷新令牌 |
| `expiresIn` | number | access token 有效期，**毫秒**（默认 `86400000`） |
| `user.id` | string(uuid) | |
| `user.username` | string | 用户名快照 |
| `user.role` | string | 角色快照，**全大写**：`SUPER_ADMIN` / `ADMIN` / `MODERATOR` / `USER` / `GUEST` |

> `user.role` 只是给前端做初始渲染用的快照。服务端每次请求都回库取角色（见 [01-architecture.md](01-architecture.md#鉴权链)），改角色后无需重新登录也能立即生效。

### 1.3 用户 `/api/users`

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| POST | `/api/users` | 公开 | `UserResponseDto` |
| GET | `/api/users` | MODERATOR+ | `Paginated<UserListItemDto>` |
| GET | `/api/users/me` | USER+ | `UserResponseDto` |
| PATCH | `/api/users/me/password` | USER+ | `{ message: string }` |
| GET | `/api/users/{id}/public` | 公开 | `{ id, username, bio, role, avatar: { path } \| null, avatarUrl }` |
| GET | `/api/users/{id}` | 本人或管理员+ | `UserResponseDto` |
| PATCH | `/api/users/{id}` | 本人或管理员+ | `UserResponseDto` |
| DELETE | `/api/users/{id}` | 本人或管理员+ | `{ message: string }` |
| PATCH | `/api/users/{id}/role` | MODERATOR+ | `UserResponseDto` |

- `GET /api/users` 返回**全部用户**（按创建时间倒序、分页），不做 `canManageTarget` 过滤：MODERATOR 也能看到 ADMIN 的邮箱。这是现有行为，见 [07 §3](07-changes.md#3-未做--已知限制)。
- `PATCH /api/users/{id}` 的用户名/邮箱冲突返回 `409`（软删除用户仍占唯一索引）。
- `DELETE` 是软删除（写 `deletedAt`）；`CleanupService` 在保留期到期后硬删并移除图片与头像文件。

### 1.4 图片 `/api/images`

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| POST | `/api/images` | USER+ | `{ message, image: ImageResponseDto }` |
| GET | `/api/images` | 公开 | `Paginated<ImageListItemDto>` |
| GET | `/api/images/my` | USER+ | `Paginated<MyImageListItemDto>` |
| GET | `/api/images/pending` | MODERATOR+ | `Paginated<PendingImageDto>` |
| POST | `/api/images/{id}/review` | MODERATOR+，自审受限（见 1.9） | `ImageResponseDto` |
| POST | `/api/images/{id}/modify` | 上传者本人 | `{ message, image: ImageResponseDto }` |
| GET | `/api/images/{id}` | 已过审公开 / 未过审见下 | `ImageResponseDto` |
| GET | `/api/images/{id}/thumbnail` | 同上 | 二进制 `image/webp` 或 `image/jpeg` |
| GET | `/api/images/{id}/sign` | 公开 | `{ downloadUrl, expiresInMs }` |
| GET | `/api/images/{id}/download` | 签名有效即可 | 原图二进制 |
| DELETE | `/api/images/{id}` | 上传者本人或管理员+ | `{ message }` |

- `GET /api/images` 默认只返回已过审图片；`?status=pending|approved|rejected` 需要 MODERATOR+，否则 `403`。
- 未过审图片（pending / rejected）只能由审核员及以上与上传者本人访问详情与缩略图，其他人一律 `403`。
- `GET /api/images/{id}/download` 先验 `signature` + `expires`，再按 `canPreview` 校验身份：已过审图片的签名谁都能用，未过审的只有在场身份是本人或 MODERATOR+ 才放行。
- `GET /api/images/{id}/sign` 对不存在的 id 返回 `404`；对「未过审且你不是本人/审核员」的图片返回 `403`——不会先给链接、下载时才失败。
- 响应里所有 `thumbnailUrl` 都是 `/api/images/{id}/thumbnail`，带全局前缀，可直接作为 `<img src>`。
- `ImageResponseDto` 含 `md5`（原图内容的 MD5，hex），`GET /api/images/{id}/download` 同时在响应头给出 `X-Content-MD5`，前端可以下载后自行比对做完整性校验。
- 图片接口既认 `authorization: Bearer <token>`，也认登录/刷新时下发的 `koharu_token` Cookie（`HttpOnly`、`SameSite=Lax`）。`<img>`、`<a download>` 这类浏览器原生的请求带不了自定义头，靠 Cookie 才能拿到「本人可见但未过审」的缩略图与原图；前后端不同源、Cookie 被 `SameSite` 拦掉时，可在这类 GET 图片地址上加 `?access_token=<token>` 兜底（Token 会进访问日志，仅建议用于图片流）。
- 带了凭证但已失效（过期/伪造/用户被删）时返回 `401 登录状态已失效，请重新登录`；完全不带凭证才按游客处理。这样前端不会把「Token 过期」误判成「权限不足」。
- 这三种携带方式在 `openapi.json` 里也落了地：`components.securitySchemes` 有 `bearer` 与 `koharu_token`（cookie）两套；缩略图 / 签名 / 下载三个图片流接口把 `?access_token=` 声明为可选 query 参数，且因为都允许游客访问，**不声明必选认证**；`GET /api/avatars/{userId}/pending/image` 必须登录，所以它的 `security` 是 `[{koharu_token}, {bearer}]`（二者之一）。
- 原图与缩略图在磁盘上是 AES-256-GCM 密文，由图库密码派生的密钥加密；接口返回的永远是解密后的明文（见 1.8 与 `1-architecture.md` 的「静态加密」）。

### 1.5 头像 `/api/avatars`

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| GET | `/api/avatars/pending` | MODERATOR+ | `Paginated<PendingAvatar>` |
| POST | `/api/avatars/{userId}` | 本人或管理员+ | `{ message, submission: { id, status, createdAt, imageUrl } }` |
| POST | `/api/avatars/{userId}/review` | MODERATOR+，自审受限（见 1.9） | `{ message, status, avatar }` |
| GET | `/api/avatars/{userId}/image` | 公开 | 二进制 |
| GET | `/api/avatars/{userId}/pending/image` | 本人 或 MODERATOR+ | 二进制 |
| DELETE | `/api/avatars/{userId}` | 本人或管理员+ | `{ message }` |

`PendingAvatar`：`{ submissionId, userId, username, status, imageUrl, createdAt }`，其中 `imageUrl` 固定为 `/api/avatars/{userId}/pending/image`（本人与审核员都能取；提交接口的 `submission.imageUrl` 是同一路径，方便提交后立刻预览）。

审核响应统一为：

```json
{ "message": "头像已通过审核", "status": "approved", "avatar": { "id": "…", "userId": "…", "createdAt": "…" } }
{ "message": "头像已拒绝并作废，已回退到上一个头像", "status": "rejected", "avatar": null }
```

### 1.6 图集与标签 `/api/albums`、`/api/tags`

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| POST | `/api/albums` | USER+ | `AlbumDetailDto` |
| GET | `/api/albums` | 公开 | `Paginated<AlbumSummaryDto>` |
| GET | `/api/albums/search` | 公开 | `Paginated<AlbumSummaryDto>` |
| GET | `/api/albums/{id}` | 公开图集 / 私有见下 | `AlbumDetailDto` |
| PATCH | `/api/albums/{id}` | 本人或管理员+ | `AlbumDetailDto` |
| DELETE | `/api/albums/{id}` | 本人或管理员+ | `{ message }` |
| POST | `/api/albums/{id}/unlock` | ADMIN+ | `AlbumDetailDto` |
| POST | `/api/albums/{id}/images` | 本人或管理员+ | `AlbumDetailDto` |
| DELETE | `/api/albums/{id}/images` | 本人或管理员+ | `AlbumDetailDto` |
| GET | `/api/tags` | 公开 | `Tag[]` |
| POST | `/api/tags` | MODERATOR+ | `Tag` |
| DELETE | `/api/tags/{id}` | ADMIN+ | `{ message }` |

- 列表与搜索对游客只返回 `visibility=public` 的图集；登录用户额外看到自己创建的私有图集；**审核员及以上能看到全部图集**（含他人私有）。
- 私有图集详情对非本人、非审核员返回 `404`（不暴露存在性）。
- `AlbumDetailDto.images` 对非 staff、非本人的访问者只包含已过审图片。
- `POST /api/albums/{id}/images` 只接受**已过审**且属于该图集创建者的图片 id。

### 1.7 审计 `/api/audit-logs`

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| GET | `/api/audit-logs` | ADMIN+ | `Paginated<AuditLog>` |

支持 `actorId`、`action`、`from`、`to` 过滤，按 `createdAt` 倒序。GET/HEAD/OPTIONS 请求不记录。

### 1.8 图库密钥 `/api/library`

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| GET | `/api/library/status` | 公开 | `LibraryStatus` |
| POST | `/api/library/password` | ADMIN+ | `LibraryStatus`（含 `message`） |
| POST | `/api/library/unlock` | ADMIN+ | `LibraryStatus` |

`LibraryStatus`：`{ bootstrapped, unlocked, activeVersion, rotation: { status, total, done, error } }`。

- `unlocked=false` 时，缩略图、原图下载、图片上传都会返回 `503`，提示管理员先解锁。
- `POST /api/library/password` 的 body 是 `{ oldPassword, newPassword }`（新密码 8–128 字符）。成功后 `activeVersion` 加一，后台逐个把原图重新加密，期间服务照常读写。
- `POST /api/library/unlock` 的 body 是 `{ password }`。进程重启后若 `adminInfo/info.json` 里没有可用密码（例如被清掉或换了机器），用它手工解锁。
- 图库密码只有 `ADMIN` 及以上能改；密码本体只存在于 `adminInfo/info.json`（权限 `0600`），数据库里只有它的 bcrypt 哈希和「被密码包裹的数据密钥」。

### 1.9 自审赦免 `/api/review-exemptions`

「审核是他人复核」默认禁止审核自己上传的图片与提交的头像。`ADMIN` / `SUPER_ADMIN` 天然豁免（无需配置）；普通审核员需要由管理员显式加入赦免名单才能自审。

| 方法 | 路径 | 权限 | 成功响应 |
|---|---|---|---|
| GET | `/api/review-exemptions` | ADMIN+ | `{ data: ReviewExemptionItemDto[], total }` |
| POST | `/api/review-exemptions/{userId}` | ADMIN+ | `201` + `ReviewExemptionItemDto` |
| DELETE | `/api/review-exemptions/{userId}` | ADMIN+ | `{ message }` |

`ReviewExemptionItemDto`：`{ userId, username, role }`。

- 名单只包含**被显式授予**的审核员；`ADMIN` / `SUPER_ADMIN` 天然豁免，不会出现在列表里。
- `POST` 的 `{userId}` 是路径参数（UUID，格式非法直接 `400`）。目标不存在 → `404`；目标是 `ADMIN` 及以上 → `409`（本就豁免，无需加入）；目标角色是 `USER` / `GUEST`（没有审核权限）→ `400`；重复加入 → `409`。
- `DELETE` 目标为 `ADMIN` 及以上 → `400`（默认豁免，名单里不会有）；不在名单 → `404`。
- 加入/移出都会写审计日志，`action` 分别是 `POST /review-exemptions/:userId` 与 `DELETE /review-exemptions/:userId`。
- 豁免同时作用于图片审核与头像审核：`POST /api/images/{id}/review`、`POST /api/avatars/{userId}/review` 的自审 `403` 对名单内审核员失效。

---

## 2. 请求体

### 2.1 认证

| DTO | 字段 | 类型 | 约束 |
|---|---|---|---|
| `LoginDto` | `username` | string | 必填 |
| | `password` | string | 必填；`encrypted=true` 时是 RSA 密文的 base64 |
| | `encrypted` | boolean | 默认 `false` |
| `RefreshTokenDto` | `refreshToken` | string | 必填 |

### 2.2 用户

| DTO | 字段 | 类型 | 约束 |
|---|---|---|---|
| `CreateUserDto` | `username` | string | 必填，2–50 |
| | `email` | string | 必填，邮箱格式 |
| | `password` | string | 必填，6–100（加密时长度单独校验） |
| | `bio` | string | 可选，≤500 |
| | `encrypted` | boolean | 默认 `false` |
| `UpdateUserDto` | `username` / `email` / `bio` | string | 全部可选 |
| `UpdateUserRoleDto` | `role` | enum | 必填，须在 `assignableRoles` 内 |
| `ChangePasswordDto` | `oldPassword` | string | 必填 |
| | `newPassword` | string | 必填，6–100 |
| | `encrypted` | boolean | 默认 `false` |

### 2.3 图片

| DTO | 字段 | 类型 | 约束 |
|---|---|---|---|
| `ReviewImageDto` | `status` | enum | 必填，`approved` / `rejected` |
| | `reason` | string | `rejected` 时必填，≤255 |

`POST /api/images` 与 `POST /api/images/{id}/modify` 用 `multipart/form-data`，字段名 `file`。

### 2.4 头像

`POST /api/avatars/{userId}` 用 `multipart/form-data`，字段名 `file`。

| DTO | 字段 | 类型 | 约束 |
|---|---|---|---|
| `ReviewAvatarDto` | `status` | enum | 必填，`approved` / `rejected` |
| | `reason` | string | `rejected` 时必填，≤255 |

### 2.5 图集与标签

| DTO | 字段 | 类型 | 约束 |
|---|---|---|---|
| `CreateAlbumDto` | `title` | string | 必填，≤100 |
| | `description` | string | 可选，≤500 |
| | `visibility` | enum | 可选，`public` / `private`，默认 `public` |
| | `tags` | string[] | 可选，标签名必须已存在 |
| `UpdateAlbumDto` | `title` / `description` / `visibility` / `tags` | 同上 | 全部可选；`tags` 是**整体替换** |
| `UpdateAlbumImagesDto` | `imageIds` | uuid[] | 必填 |
| `CreateTagDto` | `name` | string | 必填，1–50，唯一 |

---

## 3. 响应结构

分页信封（所有列表接口）：

| 字段 | 类型 |
|---|---|
| `data` | `T[]` |
| `total` | number |
| `page` | number |
| `limit` | number |
| `totalPages` | number |

### 3.1 用户

| Schema | 字段 |
|---|---|
| `UserResponseDto` | `id`、`username`、`email`、`role`、`bio`、`emailVerified`、`reviewExempt`、`avatar`（`UserAvatarDto \| null`）、`createdAt`、`updatedAt`、`deletedAt` |
| `UserListItemDto` | `id`、`username`、`email`、`role`、`bio`、`emailVerified`、`avatar`、`avatarUrl`、`createdAt`（**无** `updatedAt` / `deletedAt`） |
| `UserAvatarDto` | `id`、`path`、`userId`、`createdAt` |

### 3.2 图片

| Schema | 字段 |
|---|---|
| `ImageResponseDto` | `id`、`filename`、`thumbnailPath`、`thumbnailUrl`、`mimeType`、`size`、`width`、`height`、`userId`、`status`、`rejectReason`、`editCount`、`md5`、`createdAt`、`updatedAt` |
| `ImageListItemDto` | `id`、`filename`、`thumbnailPath`、`thumbnailUrl`、`mimeType`、`size`、`width`、`height`、`userId`、`status`、`createdAt` |
| `MyImageListItemDto` | `ImageListItemDto` + `rejectReason`、`archived` |
| `PendingImageDto` | `ImageListItemDto` + `username` |

「我上传的」额外给出 `archived`（是否已被归档进图集）与 `rejectReason`；待审队列额外给出 `username`（上传者），方便审核员判断来源。

> 详情与列表**不返回** `path`、`uploaderIp`、`reviewedBy`。`md5` 只在详情（`ImageResponseDto`）里给出，用于下载后做完整性校验；`GET /api/images/{id}/download` 另有同值的 `X-Content-MD5` 响应头。


### 3.3 图集

| Schema | 字段 |
|---|---|
| `AlbumOwnerDto` | `id`、`username` |
| `AlbumTagDto` | `id`、`name` |
| `AlbumSummaryDto` | `id`、`title`、`description`、`visibility`、`locked`、`ownerId`、`owner`、`tags`、`imageCount`、`createdAt`、`updatedAt` |
| `AlbumDetailDto` | `id`、`title`、`description`、`visibility`、`locked`、`ownerId`、`owner`、`tags`、`images`、`createdAt`、`updatedAt` |
| `AlbumImageDto` | `id`、`filename`、`thumbnailPath`、`thumbnailUrl`、`status` |

### 3.4 其他

| Schema | 字段 |
|---|---|
| `Tag` | `id`、`name`、`createdAt` |
| `AuditLog` | `id`、`actorId`、`actorUsername`、`actorRole`、`action`、`method`、`path`、`statusCode`、`ip`、`userAgent`、`durationMs`、`detail`、`success`、`createdAt` |
| `ReviewExemptionItemDto` | `userId`、`username`、`role` |

`action` 形如 `POST /images/:id/review`（路由模板，不是真实路径）；`detail` 目前只在登录时写入 `{ username }`。

---

## 4. 典型调用流程

### 4.1 加密登录

```bash
BASE=http://localhost:3000/api

# 1) 取公钥
curl -s $BASE/auth/public-key

# 2) 用公钥加密密码（Node 示例，RSA-OAEP + SHA-256）
node -e "
const crypto=require('crypto'),fs=require('fs');
const pub=fs.readFileSync('configs/rsa_public.pem','utf8');
const enc=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from('123456')).toString('base64');
console.log(enc);"

# 3) 登录
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"test1","password":"<上一步输出>","encrypted":true}'
```

### 4.2 上传 → 审核 → 公开可见

```bash
TOKEN=...            # 普通用户
MOD=...              # 审核员及以上

# 上传
curl -s -X POST $BASE/images -H "Authorization: Bearer $TOKEN" -F "file=@./cat.png"
# → { "message": "图片上传成功，等待审核", "image": { "id": "<IMG>", "status": "pending", … } }

# 审核员拿待审队列（先来先审）
curl -s $BASE/images/pending?page=1\&limit=20 -H "Authorization: Bearer $MOD"

# 通过审核
curl -s -X POST $BASE/images/<IMG>/review -H "Authorization: Bearer $MOD" \
  -H 'Content-Type: application/json' -d '{"status":"approved"}'

# 游客视角（无需任何 token）
curl -s $BASE/images/<IMG>
curl -s -o thumb.webp $BASE/images/<IMG>/thumbnail
curl -s $BASE/images/<IMG>/sign          # → { downloadUrl, expiresInMs }
curl -s -o cat.png "<downloadUrl>"
```

### 4.3 头像审核

```bash
curl -s $BASE/avatars/pending -H "Authorization: Bearer $MOD"
curl -s -o pending.jpg $BASE/avatars/<USER_ID>/pending/image -H "Authorization: Bearer $MOD"
curl -s -X POST $BASE/avatars/<USER_ID>/review -H "Authorization: Bearer $MOD" \
  -H 'Content-Type: application/json' -d '{"status":"rejected","reason":"请使用正面清晰照片"}'
```

---

## 5. 分页与筛选

| 参数 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `page` | number | 1 | ≥ 1 |
| `limit` | number | 20 | 1–100 |

```bash
# 我的待审图片
curl -s "$BASE/images/my?status=pending" -H "Authorization: Bearer $TOKEN"

# 通用状态筛选（需审核员及以上）
curl -s "$BASE/images?status=rejected&page=2&limit=50" -H "Authorization: Bearer $MOD"

# 图集搜索：关键词 + 标签（标签需全部命中），标签可重复传
curl -s "$BASE/albums/search?q=旅行&tags=风景&tags=人像"
```
