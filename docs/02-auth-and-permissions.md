# 02 认证与权限

## 角色

五个角色，级联关系用数值比较：`src/common/utils/role.util.ts` 里 `ROLE_RANK = { GUEST: 0, USER: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 }`。

| 角色 | rank | 说明 |
|---|---|---|
| `SUPER_ADMIN` | 4 | 种子账号 `admin` 自动晋升而来；不可被删除、角色不可被修改、用户名不可被修改 |
| `ADMIN` | 3 | 可管理 MODERATOR / USER / GUEST |
| `MODERATOR` | 2 | 审核员，可管理 USER / GUEST；审核图片与头像 |
| `USER` | 1 | 注册后的默认角色，可上传、建图集 |
| `GUEST` | 0 | 未登录的虚拟身份，不落库、不能登录，只是「无 token」的称呼 |

注册一律得到 `USER`。`GUEST` 有两层含义：未登录请求的虚拟身份，以及一个**可被显式授予**的低权角色（`assignableRoles` 里包含 GUEST，rank 0，权限等同游客，常用于冻结账号）。注册流程永远不会产出 GUEST。

## 谁能管谁

`canManageTarget(actor, target)` 决定「能否查看/修改/删除某人」：

| 操作者 ↓ / 目标 → | SUPER_ADMIN | ADMIN | MODERATOR | USER | GUEST |
|---|---|---|---|---|---|
| SUPER_ADMIN | — | 是 | 是 | 是 | 是 |
| ADMIN | 否 | 否 | 是 | 是 | 是 |
| MODERATOR | 否 | 否 | 否 | 是 | 是 |
| USER | 否 | 否 | 否 | — | — |

`assignableRoles(actor)` 决定「能把别人改成什么角色」：

| 操作者 | 可授予 |
|---|---|
| SUPER_ADMIN | ADMIN、MODERATOR、USER、GUEST |
| ADMIN | MODERATOR、USER、GUEST |
| MODERATOR | USER、GUEST |

两条硬约束在所有路径上都生效：

- **不能改自己的角色**（含降级），改自己角色一律 403。
- **SUPER_ADMIN 的账号不可删除、角色不可修改**；用户名只有本人能改，而 SUPER_ADMIN 的用户名连本人也改不了。

## 权限矩阵

`公开` = 不需要 token。`USER+` = 需要登录；标了「本人」的还要 owner 判定。

### 认证

| 接口 | 权限 | 说明 |
|---|---|---|
| `GET /api/auth/public-key` | 公开 | 返回 RSA 公钥（SPKI PEM） |
| `POST /api/auth/login` | 公开 | 用户名+密码，可选 RSA 加密传输；失败过多 429 |
| `POST /api/auth/refresh` | 公开 | 用 refreshToken 换新的 accessToken |

### 用户

| 接口 | 权限 |
|---|---|
| `POST /api/users`（注册） | 公开 |
| `GET /api/users/{id}/public` | 公开（只有 id/username/bio/role/avatar） |
| `GET /api/users/me` | USER+（本人） |
| `PATCH /api/users/me/password` | USER+（本人） |
| `GET /api/users` | MODERATOR+ |
| `GET /api/users/{id}` | 本人 或 `canManageTarget` |
| `PATCH /api/users/{id}` | 本人 或 `canManageTarget`；用户名仅本人可改 |
| `DELETE /api/users/{id}` | 本人 或 `canManageTarget`；SUPER_ADMIN 永不 |
| `PATCH /api/users/{id}/role` | MODERATOR+ 且受 `canManageTarget` + `assignableRoles` 双重限制 |

### 图片

| 接口 | 权限 |
|---|---|
| `GET /api/images` | 公开，默认只看 `approved`；带 `status` 筛选需 MODERATOR+ |
| `GET /api/images/{id}` | 已过审公开；未过审 → 本人 或 MODERATOR+ |
| `GET /api/images/{id}/thumbnail` | 同上 |
| `GET /api/images/{id}/sign` | 公开（生成签名链接本身不查权限） |
| `GET /api/images/{id}/download` | 需有效签名；已过审公开，未过审 → 本人 或 MODERATOR+ |
| `POST /api/images` | USER+，同 IP 每日 500 张（ADMIN/SUPER_ADMIN 不限） |
| `GET /api/images/my` | USER+（只返回本人的） |
| `POST /api/images/{id}/modify` | 本人，且 `editCount = 0` |
| `GET /api/images/pending` | MODERATOR+ |
| `POST /api/images/{id}/review` | MODERATOR+，且不能是上传者本人 |
| `DELETE /api/images/{id}` | 本人 或 `canManageTarget` |

### 头像

| 接口 | 权限 |
|---|---|
| `GET /api/avatars/{userId}/image` | 公开（只给已过审的当前头像） |
| `POST /api/avatars/{userId}` | 本人；同时只能有一条 pending |
| `DELETE /api/avatars/{userId}` | 本人 或 `canManageTarget` |
| `GET /api/avatars/pending` | MODERATOR+ |
| `GET /api/avatars/{userId}/pending/image` | MODERATOR+ |
| `POST /api/avatars/{userId}/review` | MODERATOR+，且不能审自己 |

### 图集与标签

| 接口 | 权限 | 可见/可改范围 |
|---|---|---|
| `GET /api/albums`、`/api/albums/search` | 公开 | 游客：只看 `public`；登录：`public` + 自己的私有；**MODERATOR+ 看全部** |
| `GET /api/albums/{id}` | 公开 | 私有图集仅本人或 MODERATOR+，其余 404（不是 403，避免探测存在性） |
| `POST /api/albums` | USER+ | — |
| `PATCH /api/albums/{id}` | 本人（未被锁定）或 `canManageTarget` | 改 `visibility` 额外要求 ADMIN+；管理员把别人的图集设为私有会同时 `locked=true` |
| `DELETE /api/albums/{id}` | 本人（未被锁定）或 `canManageTarget` | 只删图集，不删图片 |
| `POST /api/albums/{id}/images` | 本人或 `canManageTarget` | 只能归档已过审图片；本人只能归档自己的图片 |
| `DELETE /api/albums/{id}/images` | 同上 | 只解除关联 |
| `POST /api/albums/{id}/unlock` | ADMIN+ 且 `canManageTarget`（对图集 owner 的角色） | 解锁并恢复 `public` |
| `GET /api/tags` | 公开 | — |
| `POST /api/tags` | MODERATOR+ | 重名 409 |
| `DELETE /api/tags/{id}` | ADMIN+ | 同时从所有图集移除该标签 |

### 审计

| 接口 | 权限 |
|---|---|
| `GET /api/audit-logs` | ADMIN+ |

## 登录与令牌

### 注册

`POST /api/users`，`{ username, email, password, bio?, encrypted? }`：

- 用户名 ≥ 3 字符，密码 ≥ 6 字符，邮箱格式校验。
- 用户名、邮箱唯一（含软删除用户）；撞了返回 409。
- 响应是脱敏后的 `UserResponseDto`，不含 `password`。

### 登录流程

```text
① GET /auth/public-key            → { publicKey }    （SPKI PEM，可缓存）
② 前端用 RSA-OAEP(SHA-256) 加密密码，得到 base64
③ POST /auth/login
   { username, password: "<base64>", encrypted: true }
   → { accessToken, refreshToken, expiresIn, user: { id, username, role } }
```

`encrypted` 缺省为 `false`，此时 `password` 是明文——**只在纯内网/本地调试时这样用**，公网必须走 HTTPS，并建议开启加密，避免密码出现在任何一层代理日志里。

RSA 密钥对在首次启动时生成到 `configs/rsa_private.pem`（权限 600）与 `configs/rsa_public.pem`，之后每次启动复用。删掉这两个文件会重新生成——**旧的前端缓存公钥随即失效**。

### 令牌

| 项 | 值 | 配置键 |
|---|---|---|
| access token 有效期 | 24 小时 | `server.token.timeout` |
| refresh token 有效期 | 8 天 | `server.token.refresh_timeout` |
| 签名算法 | HS256 | — |
| payload | `{ sub: <userId>, iat, exp }` | — |

`role` 不在 token 里。每次请求由 `JwtStrategy` 用 `sub` 回库查 `{ id, username, role }`，所以管理员改角色会**立刻生效**，不需要等 token 过期；代价是每个受保护请求多一次主键查询。

刷新：

```http
POST /api/auth/refresh
{ "refreshToken": "..." }
→ { "accessToken": "...", "expiresIn": 86400000 }
```

refresh token 无效或过期返回 401，此时只能重新登录。

## 登录频控

`src/auth/login-throttle.service.ts`，纯进程内存，无外部依赖。

| 桶 | 默认阈值 | 窗口 / 封禁 | 配置键 |
|---|---|---|---|
| 用户名 | 5 次失败 | 15 分钟 / 15 分钟 | `auth.login_throttle.max_failures` |
| IP | 20 次失败 | 同上 | `auth.login_throttle.ip_max_failures` |

超限响应（HTTP 429）：

```json
{
  "statusCode": 429,
  "message": "登录失败次数过多，请 892 秒后再试",
  "error": "Too Many Requests",
  "retryAfterMs": 891540
}
```

设计要点：

- 封禁期内**不查库、不做 bcrypt 比对**，直接 429。这同时堵掉了「用响应时间差判断用户名是否存在」的探测手法。
- 登录成功只清用户名桶，**IP 桶保留**。否则攻击者用一个自己已知密码的账号频繁登录，就能把 IP 计数刷掉。
- 只有「用户名存在但密码错」和「用户名不存在」计入失败；DTO 校验失败的请求（比如密码少于 6 位）在进入 controller 之前就被拦掉，不计入。

**多实例注意**：计数在各自进程里，N 个实例等效阈值放大 N 倍。需要全局一致就要换 Redis 计数，或者在最外层网关做限流。

## 游客能看到什么

未登录（无 token，或 token 非法/过期被当作游客）时：

| 能看到 | 看不到 |
|---|---|
| 已过审图片的列表、详情、缩略图、签名链接与原图下载 | 未过审图片（403），列表里也筛不出来（筛选需 MODERATOR+） |
| 公开图集列表、详情、搜索 | 私有图集（列表不出现；详情 404） |
| 标签列表 | 待审核队列、我的投稿、审计日志 |
| 用户公开资料（id/username/bio/role/avatar） | 邮箱等隐私字段 |
| 用户当前头像图流 | 待审头像流 |

一个容易误解的行为：**公开接口用 `OptionalJwtAuthGuard`，token 失效不会报 401，而是退化成游客身份。** 所以「同一个接口登录后字段变少」通常意味着 token 过期了，前端在受保护接口收到 401 时应先尝试刷新，而不是把用户踢下线。

## 审核规则

状态机见 [01-architecture.md](01-architecture.md#审核状态机)，这里只列权限层面的硬约束：

| 规则 | 结果 |
|---|---|
| 审核员审核自己上传的图片 / 自己提交的头像 | 403 |
| 已过审图片再审核成 `approved` | 409（无需重复审核） |
| 两个审核员同时审同一张图，后提交者 | 409（状态已被变更） |
| `rejected` 不带 `reason` | 400 |
| 审核入参传 `pending` | 400（只接受 approved / rejected） |
| 同一用户已有待审头像时再提交 | 409 |
| 改稿第二次 | 400（终身一次） |

409 都建议前端提示「刷新列表后重试」，而不是静默重试——因为另一名审核员可能已经做了相反的决定。
