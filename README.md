<p align="center">
  <a href="" target="blank">
    <img 
      src="./image/icon.png" 
      width="120" 
      height="120" 
      style="border-radius: 50%; object-fit: cover; border: 4px solid #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" 
      alt="Koharu Logo" 
    />
  </a>
</p>

<h1 align="center">Koharu Backend</h1>

<p align="center">
  一个基于 NestJS 构建的渐进式、高安全、可扩展的图库后端服务。
  <br />
  内置完整的 JWT 认证、RBAC 权限控制、企业级图片库管理及严格的文件安全防护。
</p>

<p align="center">
  <a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/badge/Node.js-v22.x-green.svg" alt="Node Version" /></a>
  <a href="https://nestjs.com" target="_blank"><img src="https://img.shields.io/badge/NestJS-v12.x-red.svg" alt="NestJS Version" /></a>
  <a href="https://pnpm.io" target="_blank"><img src="https://img.shields.io/badge/Package%20Manager-pnpm-orange.svg" alt="Package Manager" /></a>
  <a href="https://www.typescriptlang.org" target="_blank"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" /></a>
</p>

---

## 核心特性 (Features)

-  **安全认证与授权**：基于 JWT 的双 Token 机制 (Access + Refresh)，配合严格的 RBAC (Role-Based Access Control) 守卫。
-  **企业级图片库**：
  - 原图与缩略图分离存储 (`/images` & `/image_cache`)，基于 `sharp` 自动裁剪压缩。
  - 基于 HMAC-SHA256 的**签名防盗链下载链接**，支持毫秒级过期控制。
  - 自动计算 MD5 实现图片去重与秒传。
-  **生产级文件安全**：
  - 严格的 Magic Bytes (文件头) 校验，杜绝扩展名伪造攻击。
  - 路径遍历攻击 (Path Traversal) 防护与空字节注入拦截。
  - 上传/删除时自动联动清理磁盘垃圾文件。
-  **健壮的数据层**：PostgreSQL + TypeORM，支持 UUID 主键、软删除 (`DeleteDateColumn`) 及级联关系管理。
-  **全局可观测性**：基于 Winston 的全局日志系统，支持多级别、按天自动切割、错误日志隔离及彩色控制台输出。
-  **配置驱动**：基于 `@nestjs/config` 的 YAML 集中式配置管理，支持环境变量覆盖。
-  **自动初始化 (Auto-Seed)**：应用启动时自动检测并创建默认系统管理员，解决“鸡生蛋”问题。

---

## 技术栈 (Tech Stack)

- **Runtime**: Node.js (ESM Mode)
- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Package Manager**: pnpm
- **Validation**: class-validator, class-transformer
- **Security**: bcrypt, passport-jwt, crypto, sharp, file-type

---

## 快速开始 (Quick Start)

### 1. 环境准备
确保你的系统中已安装以下环境：
- [Node.js](https://nodejs.org/) (推荐 v20.x 或 v22.x)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) (推荐 v15+)

### 2. 安装依赖
```bash
pnpm install
```

### 3. 配置数据库与密钥
复制默认配置或修改 `configs/config.yaml` (首次运行会自动生成)：
```yaml
database:
  postgres:
    host: "localhost"
    port: 5432
    username: "your_username"
    password: "your_password"
    database: "koharu_db"
    synchronize: true  # !首次启动设为 true 以自动建表，之后请改为 false
    logging: false

server:
  port: 9910
  token:
    key: "your-super-secret-key-here" # 请替换为安全的随机字符串
```

### 4. 启动项目
```bash
# 开发模式 (热重载)
pnpm run start:dev

# 生产模式 (需先执行 pnpm run build)
pnpm run start:prod
```

---

## 默认管理员 (Default Admin)

得益于内置的 `SeedService`，首次启动项目时，系统会自动在数据库中创建一个默认管理员账号：

- **用户名**: `admin`
- **密码**: `Admin@123456`
- **角色**: `ADMIN`

> !!! **安全警告**：请在生产环境部署前，立即通过 API 或数据库修改此默认密码！

## 安全与最佳实践 (Security & Best Practices)

1. **文件上传防护**：所有文件上传均经过 `FileService` 的严格校验，包括大小限制、MIME 类型白名单以及底层的 Magic Bytes 校验，防止恶意脚本上传。
2. **权限隔离**：敏感操作（如删除、修改他人信息）均在 Controller 层通过 `@UseGuards(JwtAuthGuard, RolesGuard)` 拦截，并在 Service 层进行二次业务逻辑校验。
3. **密码安全**：所有密码均使用 `bcrypt` 进行加盐哈希存储，API 响应中自动剥离敏感字段。
4. **生产环境配置**：部署到生产环境前，请务必将 `database.postgres.synchronize` 设置为 `false`，并使用 TypeORM Migration 管理数据库结构变更。

---

## License

Koharu Backend is [MIT licensed](LICENSE).