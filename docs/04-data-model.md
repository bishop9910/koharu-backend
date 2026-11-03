# 04 · 数据模型

12 张表由 TypeORM 实体定义（`src/entities/`）。本文是实体的等价描述。列名即属性名：项目没有启用命名策略，TypeORM 会给标识符加双引号，所以库里就是 `userId`、`createdAt` 这样的 camelCase 列名。

## 1. 关系总览

```text
users 1 ──── 1 avatars              (avatars.userId UNIQUE, ON DELETE CASCADE)
users 1 ──── N images               (images.userId,      ON DELETE SET NULL)
users 1 ──── N albums               (albums.ownerId,     ON DELETE CASCADE)
users 1 ──── N avatar_submissions   (avatar_submissions.userId, 无外键)

users 1 ──── N album_likes          (album_likes.userId,    ON DELETE CASCADE)
users 1 ──── N album_favorites      (album_favorites.userId, ON DELETE CASCADE)
users 1 ──── N album_reports        (album_reports.reporterId, ON DELETE SET NULL)

albums 1 ──── N album_likes         (album_likes.albumId,    ON DELETE CASCADE)
albums 1 ──── N album_favorites     (album_favorites.albumId, ON DELETE CASCADE)
albums 1 ──── N album_reports       (album_reports.albumId,  ON DELETE CASCADE)

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
| `reviewExempt` | boolean | 默认 `false` | 是否在自审赦免名单：`true` 的审核员可以审核自己上传的图片/提交的头像。`ADMIN` 及以上天然豁免，不依赖此列 |
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
| `reviewStatus` | enum | 默认 `none`, INDEX | 图集评审状态，见 §3；被举报核实后置 `pending` |
| `reviewEditUsed` | boolean | 默认 `false` | 本轮评审是否已用过「一次修改机会」；驳回后为 `true` 时禁止再改，只能重新提交 |
| `reviewSubmittedAt` | timestamp | 可空 | 最近一次进入待评审名单的时间；列表按它升序 |
| `reviewRound` | int | 默认 `0` | 被核实/重新提交的次数，只用于追踪 |
| `reviewedBy` | varchar | 可空 | 最近一次整集评审的审核人 id（**不对外暴露**） |
| `reviewedAt` | timestamp | 可空 | 最近一次评审时间 |
| `reviewRejectReason` | varchar(255) | 可空 | 图集被驳回的原因，仅 `rejected` 时有值 |
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

### 2.9 `library_secrets`

全库**只有一行**，存图库密码派生的密钥材料。密码本身不落库。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `salt` | varchar(64) | scrypt 的盐（base64），每次改密码重新生成 |
| `passwordHash` | varchar(255) | bcrypt(图库密码)，只用于校验「旧密码对不对」 |
| `activeVersion` | int，默认 1 | 当前数据密钥版本，每次改密码 +1 |
| `keys` | jsonb | `[{ version, wrappedKey }]`：数据密钥被「密码派生的 KEK」用 AES-256-GCM 包裹后的 base64 |
| `rotationStatus` | varchar(16) | `idle` / `running` / `failed` |
| `rotationTotal` / `rotationDone` | int | 后台重加密的进度 |
| `rotationError` | varchar(500) 可空 | 失败原因 |
| `createdAt` / `updatedAt` | timestamp | |

这两个列必须显式写 `type`（`varchar`）：TS 的联合类型（`string | null`、字符串字面量联合）在 `emitDecoratorMetadata` 里退化成 `Object`，TypeORM 无法推断列类型。

### 2.10 `album_likes`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `albumId` | uuid | INDEX, 外键→albums, `ON DELETE CASCADE` | |
| `userId` | uuid | INDEX, 外键→users, `ON DELETE CASCADE` | |
| `createdAt` | timestamp | | 点赞时间，「我点赞的图集」按它倒序 |

`UNIQUE(albumId, userId)`：同一用户对同一图集最多一条点赞记录。点赞幂等靠这个唯一键兜底。

### 2.11 `album_favorites`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `albumId` | uuid | INDEX, 外键→albums, `ON DELETE CASCADE` | |
| `userId` | uuid | INDEX, 外键→users, `ON DELETE CASCADE` | |
| `createdAt` | timestamp | | 收藏时间，收藏夹按它倒序 |

`UNIQUE(albumId, userId)`，语义与 `album_likes` 相同。

### 2.12 `album_reports`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `albumId` | uuid | INDEX, 外键→albums, `ON DELETE CASCADE` | 被举报图集 |
| `reporterId` | uuid | 可空, 外键→users, `ON DELETE SET NULL` | 举报人；用户硬删后置空，举报记录保留 |
| `reason` | varchar(500) | 非空 | 举报原因 |
| `detail` | varchar(1000) | 可空 | 补充说明 |
| `status` | enum | 默认 `pending`, INDEX | 见 §3；复合索引 `(albumId, status)` |
| `handledBy` | varchar | 可空 | 处理人 id（**不对外暴露**） |
| `handledAt` | timestamp | 可空 | 核实/驳回时间 |
| `resolutionNote` | varchar(500) | 可空 | 处理备注 |
| `createdAt` / `updatedAt` | timestamp | | |

同一用户对同一图集只允许保留一条 `pending` / `verified` 举报（业务层校验，非数据库唯一约束，因为历史已处理举报需要保留多条）。

## 3. 枚举

| 枚举 | 值 | 使用位置 |
|---|---|---|
| `Role` | `SUPER_ADMIN` / `ADMIN` / `MODERATOR` / `USER` / `GUEST` | `users.role` |
| `ImageStatus` | `pending` / `approved` / `rejected` | `images.status` |
| `AvatarStatus` | `pending` / `approved` / `rejected` | `avatar_submissions.status` |
| `AlbumVisibility` | `public` / `private` | `albums.visibility` |
| `AlbumReviewStatus` | `none` / `pending` / `approved` / `rejected` | `albums.reviewStatus` |
| `ReportStatus` | `pending` / `verified` / `dismissed` / `resolved` | `album_reports.status` |

角色**全大写**，状态与可见性**全小写**——这是历史约定，前后端都按原样对接。

## 4. 不落库的派生字段

接口里的这些字段不是列，由服务层计算：

| 字段 | 来源 |
|---|---|
| `thumbnailUrl` | `/api/images/{id}/thumbnail`（图集里是 `/api/images/{imageId}/thumbnail`） |
| `archived` | 该图片是否已加入任一图集（`images` 关系是否为空） |
| `username`（待审图片队列） | join `users` |
| `username`（待审头像队列） | 按 `userId` 批量查 `users` 后拼装，**不是** join |
| `imageCount` | `albums.images` 的长度（列表接口用 `album_images` 关联计数） |
| `likeCount` / `favoriteCount` | 按 `album_likes` / `album_favorites` 分组计数 |
| `likedByMe` / `favoritedByMe` | 当前用户是否在 `album_likes` / `album_favorites` 中；未登录为 `false` |
| `pendingImageCount` | 待评审列表里该图集 `status=pending` 的图片数 |
| `reports`（待评审列表） | 该图集 `status=verified` 的举报，按时间倒序 |

## 5. 级联与删除语义

| 操作 | 实际发生 |
|---|---|
| 删除用户 | 写 `deletedAt`（软删除）+ 立即删除其图片、头像文件与图集记录 |
| 保留期到期 | `CleanupService` 硬删软删除用户（`DELETE`），级联清掉 `avatars`、`albums` |
| 删除图片 | 删除原图 + 缩略图缓存 + 从所有图集移除 + 删数据库行 |
| 删除头像投稿 | 删除文件 + 删 `avatar_submissions` 行 |
| 删除图集 | 删行 + 清 `album_images` / `album_tags` 关联（图片本身保留）；级联删除其 `album_likes`、`album_favorites`、`album_reports` |
| 删除标签 | 先从所有图集上摘掉，再删标签（管理员操作） |
| 硬删除用户 | 级联删除其 `album_likes`、`album_favorites`；`album_reports.reporterId` 置空，举报记录保留 |

`images.userId` 是 `SET NULL`：理论上删用户后图片会变成"无主"，但业务层会先删图，所以只有绕过业务层直接删行才会遇到 `userId = null`。

## 6. 生产环境的迁移注意

`configs/config.yaml` 的 `database.postgres.synchronize` 在本地为 `true`，**生产必须是 `false`**。仓库里没有迁移文件，因此：

- 新增可空列（如给 `avatar_submissions` 加 `rejectReason`）需要手写 `ALTER TABLE`。
- 新增非空列必须带 `DEFAULT`，否则已有行会失败。`users.reviewExempt`（自审赦免标记）就是这类列，上线时执行：
  ```sql
  ALTER TABLE users ADD COLUMN "reviewExempt" boolean NOT NULL DEFAULT false;
  ```
  `DEFAULT false` 让存量用户全部保持「不能自审」，管理员及以上不依赖该列、自然豁免。
- 图集点赞/收藏/举报与评审状态是同一批新增结构，上线时按下面顺序执行（TypeORM 在本地 `synchronize=true` 生成的 Postgres 枚举类型名形如 `albums_reviewstatus_enum`；若你的库中不同，以实际名称为准）：
  ```sql
  -- 1) 新枚举
  CREATE TYPE "albums_reviewstatus_enum" AS ENUM ('none', 'pending', 'approved', 'rejected');
  CREATE TYPE "album_reports_status_enum" AS ENUM ('pending', 'verified', 'dismissed', 'resolved');

  -- 2) albums 新列（全部带默认值或可空，存量行安全）
  ALTER TABLE albums ADD COLUMN "reviewStatus" "albums_reviewstatus_enum" NOT NULL DEFAULT 'none';
  ALTER TABLE albums ADD COLUMN "reviewEditUsed" boolean NOT NULL DEFAULT false;
  ALTER TABLE albums ADD COLUMN "reviewSubmittedAt" timestamp;
  ALTER TABLE albums ADD COLUMN "reviewRound" int NOT NULL DEFAULT 0;
  ALTER TABLE albums ADD COLUMN "reviewedBy" varchar;
  ALTER TABLE albums ADD COLUMN "reviewedAt" timestamp;
  ALTER TABLE albums ADD COLUMN "reviewRejectReason" varchar(255);
  CREATE INDEX "IDX_albums_reviewStatus" ON albums ("reviewStatus");

  -- 3) 点赞 / 收藏
  CREATE TABLE "album_likes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "albumId" uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_album_likes_album_user" UNIQUE ("albumId", "userId")
  );
  CREATE INDEX "IDX_album_likes_album" ON "album_likes" ("albumId");
  CREATE INDEX "IDX_album_likes_user" ON "album_likes" ("userId");

  CREATE TABLE "album_favorites" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "albumId" uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_album_favorites_album_user" UNIQUE ("albumId", "userId")
  );
  CREATE INDEX "IDX_album_favorites_album" ON "album_favorites" ("albumId");
  CREATE INDEX "IDX_album_favorites_user" ON "album_favorites" ("userId");

  -- 4) 举报
  CREATE TABLE "album_reports" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "albumId" uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    "reporterId" uuid REFERENCES users(id) ON DELETE SET NULL,
    "reason" varchar(500) NOT NULL,
    "detail" varchar(1000),
    "status" "album_reports_status_enum" NOT NULL DEFAULT 'pending',
    "handledBy" varchar,
    "handledAt" timestamp,
    "resolutionNote" varchar(500),
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE INDEX "IDX_album_reports_album_status" ON "album_reports" ("albumId", "status");
  ```
- 如果选择复用已有枚举类型，新增枚举值必须用 `ALTER TYPE ... ADD VALUE`，且不能放在事务块里（旧版本限制）。上面的 SQL 用 `gen_random_uuid()` 生成主键，需要 PostgreSQL 13+（或已安装 `pgcrypto`）。
- 新增外键（如 `avatar_submissions.userId → users.id`）会因历史脏数据失败，先跑一遍 `SELECT` 校验。
