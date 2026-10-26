# 04 · 数据模型

9 张表由 TypeORM 实体定义（`src/entities/`）。本文是实体的等价描述。列名即属性名：项目没有启用命名策略，TypeORM 会给标识符加双引号，所以库里就是 `userId`、`createdAt` 这样的 camelCase 列名。

## 1. 关系总览

```text
users 1 ──── 1 avatars              (avatars.userId UNIQUE, ON DELETE CASCADE)
users 1 ──── N images               (images.userId,      ON DELETE SET NULL)
users 1 ──── N albums               (albums.ownerId,     ON DELETE CASCADE)
users 1 ──── N avatar_submissions   (avatar_submissions.userId, 无外键)

images N ──── N albums              (album_images)
albums N ──── N tags                (album_tags)

audit_logs 独立表，无外键（保存操作者快照，避免用户改名/删除后审计失真）
```

## 2. 表结构

### 2.1 `users`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `username` | varchar(50) | UNIQUE, INDEX | |
| `email` | varchar(100) | UNIQUE, INDEX | |
| `password` | varchar | 非空 | bcrypt 哈希，`bcrypt.hash(pwd, 10)` |
| `role` | enum | 默认 `USER` | 见 §3 |
| `bio` | varchar(500) | 可空 | |
| `emailVerified` | boolean | 默认 `true` | 当前无邮件验证流程，注册即视为已验证 |
| `avatar` | — | OneToOne | 虚拟关系，实际列在 `avatars`（见 2.3） |
| `createdAt` | timestamp | | `@CreateDateColumn` |
| `updatedAt` | timestamp | | `@UpdateDateColumn` |
| `deletedAt` | timestamp | 可空, INDEX | `@DeleteDateColumn`，软删除 |

### 2.2 `images`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `filename` | varchar | 非空 | 上传时的原始文件名 |
| `path` | varchar | 非空 | 相对 `upload.dir` 的路径，如 `images/<uuid>.jpg` |
| `thumbnailPath` | varchar | 可空 | 如 `image_cache/thumb_<uuid>.webp` |
| `mimeType` | varchar | 非空 | |
| `size` | int | 非空 | 字节 |
| `width` / `height` | int | 可空 | sharp 探出的像素尺寸 |
| `userId` | uuid | 可空, 外键→users | `ON DELETE SET NULL` |
| `md5` | varchar | 非空 | 下载前做完整性校验 |
| `status` | enum | 默认 `pending`, INDEX | 见 §3 |
| `rejectReason` | varchar(255) | 可空 | 仅在 `rejected` 时有值 |
| `reviewedBy` | varchar | 可空 | 审核人 id（**不对外暴露**） |
| `editCount` | int | 默认 `0` | 终身只能改一次 |
| `uploaderIp` | varchar(64) | 可空, INDEX | 用于同 IP 日限流（**不对外暴露**） |
| `createdAt` / `updatedAt` | timestamp | | |

### 2.3 `avatars`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `path` | varchar | 非空 | `avatars/<uuid>.<ext>` |
| `userId` | uuid | UNIQUE, 外键→users, `ON DELETE CASCADE` | 一个用户最多一张 |
| `createdAt` | timestamp | | 无 `updatedAt` |

### 2.4 `avatar_submissions`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `userId` | uuid | INDEX，**无外键** | 刻意不加关系：生产 `synchronize=false`，加关系需要迁移 |
| `path` | varchar | 非空 | 与当前头像同目录 `avatars/` |
| `status` | enum | 默认 `pending`, INDEX | 见 §3 |
| `createdAt` / `updatedAt` | timestamp | | |

> 没有 `rejectReason` 列：头像被拒的原因只写进审计日志，用户侧看不到。要补这个能力必须加列（迁移）。

### 2.5 `albums`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `title` | varchar(100) | 非空 | |
| `description` | varchar(500) | 可空 | |
| `ownerId` | uuid | INDEX, 外键→users, `ON DELETE CASCADE` | |
| `visibility` | enum | 默认 `public` | 见 §3 |
| `locked` | boolean | 默认 `false` | 管理员把他人公开图集改成私有时置 `true`，原主人不能再改 |
| `createdAt` / `updatedAt` | timestamp | | |

### 2.6 `tags`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | uuid | PK |
| `name` | varchar(50) | UNIQUE |
| `createdAt` | timestamp | |

### 2.7 关联表

| 表 | 列 | 说明 |
|---|---|---|
| `album_images` | `albumId`, `imageId` | ManyToMany，`images` ↔ `albums` |
| `album_tags` | `albumId`, `tagId` | ManyToMany，`albums` ↔ `tags` |

两张表都是双向 `@ManyToMany` + `@JoinTable`，只有联合主键，没有额外列。

### 2.8 `audit_logs`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `actorId` | varchar(36) | 可空, INDEX | 未登录请求为 `null` |
| `actorUsername` | varchar(50) | 可空 | 快照，非外键 |
| `actorRole` | varchar(20) | 可空 | 快照 |
| `action` | varchar(200) | INDEX | 路由模板，如 `POST /images/:id/review` |
| `method` | varchar(10) | 可空 | |
| `path` | varchar(500) | 可空 | 真实路径（不含查询串） |
| `statusCode` | int | 可空 | |
| `ip` | varchar(64) | 可空 | |
| `userAgent` | varchar(500) | 可空 | |
| `durationMs` | int | 可空 | |
| `detail` | jsonb | 可空 | 目前只有登录写 `{ "username": "…" }` |
| `success` | boolean | 默认 `true` | `statusCode < 400` |
| `createdAt` | timestamp | INDEX | |

## 3. 枚举

| 枚举 | 值 | 使用位置 |
|---|---|---|
| `Role` | `SUPER_ADMIN` / `ADMIN` / `MODERATOR` / `USER` / `GUEST` | `users.role` |
| `ImageStatus` | `pending` / `approved` / `rejected` | `images.status` |
| `AvatarStatus` | `pending` / `approved` / `rejected` | `avatar_submissions.status` |
| `AlbumVisibility` | `public` / `private` | `albums.visibility` |

角色**全大写**，状态与可见性**全小写**——这是历史约定，前后端都按原样对接。

## 4. 不落库的派生字段

接口里的这些字段不是列，由服务层计算：

| 字段 | 来源 |
|---|---|
| `thumbnailUrl` | `/api/images/{id}/thumbnail`（图集里是 `/api/images/{imageId}/thumbnail`） |
| `archived` | 该图片是否已加入任一图集（`images` 关系是否为空） |
| `username`（待审图片队列） | join `users` |
| `username`（待审头像队列） | 按 `userId` 批量查 `users` 后拼装，**不是** join |
| `imageCount` | `albums.images` 的长度 |

## 5. 级联与删除语义

| 操作 | 实际发生 |
|---|---|
| 删除用户 | 写 `deletedAt`（软删除）+ 立即删除其图片、头像文件与图集记录 |
| 保留期到期 | `CleanupService` 硬删软删除用户（`DELETE`），级联清掉 `avatars`、`albums` |
| 删除图片 | 删除原图 + 缩略图缓存 + 从所有图集移除 + 删数据库行 |
| 删除头像投稿 | 删除文件 + 删 `avatar_submissions` 行 |
| 删除图集 | 删行 + 清 `album_images` / `album_tags` 关联（图片本身保留） |
| 删除标签 | 先从所有图集上摘掉，再删标签（管理员操作） |

`images.userId` 是 `SET NULL`：理论上删用户后图片会变成"无主"，但业务层会先删图，所以只有绕过业务层直接删行才会遇到 `userId = null`。

## 6. 生产环境的迁移注意

`configs/config.yaml` 的 `database.postgres.synchronize` 在本地为 `true`，**生产必须是 `false`**。仓库里没有迁移文件，因此：

- 新增可空列（如给 `avatar_submissions` 加 `rejectReason`）需要手写 `ALTER TABLE`。
- 新增非空列必须带 `DEFAULT`，否则已有行会失败。
- 修改枚举值（Postgres enum）需要 `ALTER TYPE ... ADD VALUE`，且不能在事务块里执行（旧版本限制）。
- 新增外键（如 `avatar_submissions.userId → users.id`）会因历史脏数据失败，先跑一遍 `SELECT` 校验。
