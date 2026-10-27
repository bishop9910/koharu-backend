# Koharu 后端文档

图库后端服务，NestJS 12 + TypeORM + PostgreSQL，版本 `0.0.2`。全部业务接口统一挂在 `/api` 前缀下。

## 文档索引

| 文件 | 内容 | 适合谁看 |
|---|---|---|
| [01-architecture.md](01-architecture.md) | 分层、模块依赖、请求生命周期、审核状态机、文件存储 | 接手代码之前 |
| [02-auth-and-permissions.md](02-auth-and-permissions.md) | 角色层级、权限矩阵、令牌、登录频控、游客可见性、不可自审 | 接前端鉴权之前 |
| [03-api.md](03-api.md) | 46 个操作的端点表、请求/响应 DTO 字段、错误码、curl 示例 | 对接接口时 |
| [04-data-model.md](04-data-model.md) | 8 张实体表 + 2 张关联表的字段、枚举、索引与级联 | 改表结构之前 |
| [05-config-and-deploy.md](05-config-and-deploy.md) | `configs/config.yaml` 全键说明、构建、启动、日志、图库密码运维、定时任务 | 部署时 |
| [06-errors.md](06-errors.md) | 统一错误体、状态码语义、各端点错误速查、客户端重试建议 | 写错误处理时 |
| [07-changes.md](07-changes.md) | 近期改动清单（新增接口、行为变更、修复的缺陷） | 升级已有客户端时 |
| [openapi.json](openapi.json) / [openapi.yaml](openapi.yaml) | 机器可读的 OpenAPI 3.0 规格，46 个操作 / 28 个 schema | 生成 SDK、导入 Postman |

`openapi.json` 是从运行中的服务导出的规格（`GET /api-doc-json`），不是手写。它和 Swagger UI（`/api-doc`）同源，所以**接口有变动时这两个文件要一起重新导出**，见文末。

## 五分钟跑起来

前置：Node.js 22、pnpm、一个可连通的 PostgreSQL。

```bash
# 1. 装依赖
pnpm install

# 2. 配置数据库（configs/config.yaml 不存在时会按默认值自动生成，首次直接改这个文件即可）
#    database.postgres.host / port / username / password / database

# 3. 启动（开发模式带热重载）
pnpm start:dev

# 4. 打开接口文档
#    http://localhost:3000/api-doc
```

首次启动时 `SeedService` 会做两件事：

- 库里已有 `admin`：确保它是 `SUPER_ADMIN`，其它不改。
- 库里没有 `admin`：创建 `admin / admin@koharu.local`，随机 16 位密码写入 `adminInfo/info.json`（该目录不入库，别丢）。

之后把 `admin` 的密码改掉，`adminInfo/info.json` 就只是一份历史记录，不再是可登录凭据——这是设计上的一次性交付。

生产模式：

```bash
pnpm build
pnpm start:prod        # node dist/main
```

## 目录结构

```text
src/
├── main.ts                  启动：全局前缀 /api、SPA 回退、ValidationPipe、Swagger
├── app.module.ts            模块装配、TypeORM 连接
├── auth/                    JWT 策略、登录/刷新、登录频控、RSA 公钥
├── user/                    用户 CRUD、角色变更、密码修改
├── image/                   图库：上传、改稿、审核、列表、缩略图、签名下载
├── avatar/                  头像投稿、审核、图片流
├── album/                   图集与标签
├── audit/                   全局审计拦截器 + 日志查询
├── cleanup/                 定时硬删过期软删用户
├── seed/                    首次启动的主管理员初始化
├── common/                  配置加载、文件服务、分页 DTO、角色工具、常量
├── entities/                7 个实体
└── enums/                   Role / ImageStatus / AvatarStatus / AlbumVisibility
configs/config.yaml          运行时配置
uploads/                     原图、头像、缩略图缓存
```

## 全局约定

| 约定 | 内容 |
|---|---|
| 前缀 | 所有接口 `http://host:3000/api/...`；`/api-doc` 是 Swagger UI |
| 路径参数 | `:id` / `:userId` 一律 UUID，格式非法直接 400，不进业务逻辑 |
| 认证 | `Authorization: Bearer <accessToken>`；标了 `@ApiBearerAuth()` 的接口才需要 |
| 角色 | `SUPER_ADMIN > ADMIN > MODERATOR > USER > GUEST`，全大写；游客即 GUEST，不需要 token |
| 分页 | 查询参数 `page`（默认 1）、`limit`（默认 20，上限 100）；响应信封 `{ data, total, page, limit, totalPages }` |
| 时间 | ISO 8601 字符串，UTC |
| 错误体 | `{ statusCode, message, error }`，校验失败时 `message` 是字符串数组 |
| 上传 | `multipart/form-data`，字段名固定 `file`，最大 20 MB，仅 jpeg/png/webp/gif |

分页信封只在列表接口出现；详情、审核、删除这类接口直接返回对象或 `{ message }`，两者不要混用。

## 审核闭环（本服务的核心流程）

```text
上传 USER+ ──▶ pending ──审核 MODERATOR+──▶ approved   （游客可见、可下载）
                 │
                 └──▶ rejected ──改稿一次──▶ pending ──▶ …
```

| 环节 | 接口 | 谁能做 |
|---|---|---|
| 找待审图片 id | `GET /api/images/pending` | MODERATOR+ |
| 看待审图片 | `GET /api/images/{id}/thumbnail` | MODERATOR+、上传者本人 |
| 审 | `POST /api/images/{id}/review` | MODERATOR+（不能审自己的） |
| 找待审头像 | `GET /api/avatars/pending` | MODERATOR+ |
| 看待审头像 | `GET /api/avatars/{userId}/pending/image` | MODERATOR+ |
| 审头像 | `POST /api/avatars/{userId}/review` | MODERATOR+（不能审自己的） |

`GET /images/pending` 是审核台的入口；`GET /images?status=pending` 是同一份数据的通用筛选入口，区别是前者固定按上传时间正序（先来先审）并附带上传者用户名。

## 重新导出 OpenAPI 规格

接口改动后，两份规格文件必须跟着更新，否则会与实现脱节：

```bash
pnpm build
node dist/main.js &                      # 或 pnpm start:prod
curl -s http://localhost:3000/api-doc-json -o docs/openapi.json
node -e "const y=require('js-yaml'),f=require('fs');f.writeFileSync('docs/openapi.yaml',y.dump(JSON.parse(f.readFileSync('docs/openapi.json','utf8').replace(/^\uFEFF/,'')),{lineWidth:200}))"
```

`docs/openapi.json` 导出时带 UTF-8 BOM，解析前记得去掉（上面的命令已经处理）。

Swagger 里 `$ref` 指向的 schema 全部来自 `src/**/dto/*.dto.ts` 与 `src/entities/*.entity.ts` 的 `@ApiProperty` 装饰器，所以**改 DTO 就等于改文档**，不要另外手写一份字段说明。
