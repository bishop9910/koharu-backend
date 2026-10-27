// 打包脚本（方案 B）：esbuild 打 CJS 单文件 → Node SEA 注入 node.exe → 组装 dist-exe/
// 用法：node scripts/package-sea.mjs [--no-build]
// 产物：dist-exe/{koharu.exe, node_modules/, configs/, adminInfo/, uploads/, logs/}
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const pkgDir = path.join(root, '.pkg');
const outDir = path.join(root, 'dist-exe');
const appDir = path.join(pkgDir, 'app');
const entryFile = path.join(appDir, 'main.cjs');
const blobFile = path.join(pkgDir, 'sea-prep.blob');
const seaConfigFile = path.join(pkgDir, 'sea-config.json');
const exePath = path.join(outDir, 'koharu.exe');

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const IMPORT_META_PLACEHOLDER = '/__sea-import-meta-url__';
const skipBuild = process.argv.includes('--no-build');

// SEA 里全局 require() 只认内置模块，而 TypeORM 的 PlatformTools.load() 正是用全局 require
// 去载数据库驱动（pg / pg-query-stream）。注入一个走 createRequire 的替代实现：
// 先按「exe 同级 node_modules」解析，再退回「启动目录 node_modules」。
const SEA_REQUIRE_BANNER = [
  'var __seaRequire = (function () {',
  "  const { createRequire } = require('node:module');",
  "  const { dirname, join } = require('node:path');",
  '  const bases = [',
  "    join(dirname(process.execPath), 'package.json'),",
  "    join(process.cwd(), 'package.json'),",
  '  ];',
  '  return function seaRequire(name) {',
  '    let lastError;',
  '    for (const base of bases) {',
  '      try { return createRequire(base)(name); } catch (error) { lastError = error; }',
  '    }',
  '    throw lastError;',
  '  };',
  '})();',
].join('\n');

const step = (message) => console.log(`\n[package-sea] ${message}`);
const sizeOf = (dir) => {
  let total = 0;
  const walk = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.isFile()) total += fs.statSync(full).size;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return `${(total / 1024 / 1024).toFixed(1)} MB`;
};

// 清掉上一次的产物
fs.rmSync(pkgDir, { recursive: true, force: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

if (!skipBuild) {
  step('编译 TypeScript（tsc -p tsconfig.build.json）');
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'],
    { stdio: 'inherit', cwd: root },
  );
}

step('用 esbuild 打成 CJS 单文件');
// 注意：esbuild 的 JS API 会 spawn 子进程走管道通信，在本仓库的沙箱下会 EPERM，只能用 CLI。
const esbuildDir = path.dirname(fs.realpathSync(require.resolve('esbuild/package.json')));
const esbuildBin = createRequire(path.join(esbuildDir, '__resolve__.js')).resolve('@esbuild/win32-x64/esbuild.exe');
execFileSync(
  esbuildBin,
  [
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node22',
    '--legal-comments=none',
    // esbuild 会给重名的类改名（class Avatar → class Avatar2），而 TypeORM 的实体关系是按
    // target.name 字符串解析的（@OneToOne('Avatar')），改名会导致「Entity metadata for User#avatar
    // was not found」。--keep-names 会把原始名字补回去。
    '--keep-names',
    '--define:process.env.NODE_ENV="production"',
    // CJS 输出里 import.meta 会被抹成空对象，而 @nestjs/typeorm 在模块顶层就用
    // createRequire(import.meta.url) 探测 TypeORM 0.3 的废弃导出；这里先填一个占位绝对路径，
    // 打完包后再替换成 process.execPath（createRequire 只接受绝对路径或 file URL 对象）
    `--define:import.meta.url="${IMPORT_META_PLACEHOLDER}"`,
    // 原生模块与必须落在磁盘上的静态资源，改成从 exe 同级的 node_modules 解析
    `--banner:js=${SEA_REQUIRE_BANNER}`,
    `--alias:sharp=${path.join(root, 'packaging', 'shims', 'sharp.cjs')}`,
    `--alias:bcrypt=${path.join(root, 'packaging', 'shims', 'bcrypt.cjs')}`,
    `--alias:swagger-ui-dist/absolute-path.js=${path.join(root, 'packaging', 'shims', 'swagger-ui-dist-path.cjs')}`,
    // Nest 用 Optional(() => import(...)) 探测这些可选包，留成外部依赖即可（缺失会被 Optional 吞掉）
    '--external:@nestjs/microservices',
    '--external:@nestjs/microservices/*',
    '--external:@nestjs/websockets',
    '--external:@nestjs/websockets/*',
    '--external:@nestjs/platform-socket.io',
    '--external:@nestjs/platform-ws',
    '--external:@nestjs/platform-fastify',
    '--external:pg-native',
    '--log-level=warning',
    `--outfile=${entryFile}`,
    path.join(root, 'dist', 'main.js'),
  ],
  { stdio: 'inherit', cwd: root },
);
console.log(`  ${path.relative(root, entryFile)} ${(fs.statSync(entryFile).size / 1024 / 1024).toFixed(2)} MB`);

// createRequire 需要绝对路径；把占位符（含引号）换成运行时的可执行文件路径
let bundled = fs.readFileSync(entryFile, 'utf8');
const placeholder = JSON.stringify(IMPORT_META_PLACEHOLDER);
const placeholderHits = bundled.split(placeholder).length - 1;
if (placeholderHits === 0) throw new Error('bundle 里没有找到 import.meta.url 占位符');
bundled = bundled.split(placeholder).join('process.execPath');
console.log(`  import.meta.url 占位符替换 ${placeholderHits} 处 → process.execPath`);

// TypeORM 的 PlatformTools.load() 用全局 require 载驱动，SEA 里必然失败（报「Postgres package
// has not been found installed」）。把该函数里的两处 require 换成 banner 注入的 __seaRequire。
const dynamicRequires = [
  'return require(name);',
  'return require(path_1.default.resolve(process.cwd() + "/node_modules/" + name));',
];
for (const call of dynamicRequires) {
  const hits = bundled.split(call).length - 1;
  if (hits !== 1) throw new Error(`bundle 里 "${call}" 命中 ${hits} 次（期望 1），TypeORM 实现可能变了`);
  bundled = bundled.replace(call, call.replace('require(', '__seaRequire('));
}
console.log(`  PlatformTools.load 的 require 替换 ${dynamicRequires.length} 处 → __seaRequire`);

// file-type 在 fromFile/fromBuffer 里用 importAtRuntime(specifier) 做动态 import（本质是 import()）。
// SEA 里的 import() 解析不到磁盘上的包（会报 Cannot find package 'strtok3'），改成 node: 走原生、
// 其余走 __seaRequire。
const runtimeImport = 'function importAtRuntime(specifier) {\n  return import(specifier);\n}';
const patchedImport = 'function importAtRuntime(specifier) {\n  if (specifier.startsWith("node:")) return import(specifier);\n  return Promise.resolve(__seaRequire(specifier));\n}';
if (bundled.split(runtimeImport).length - 1 !== 1) throw new Error('bundle 里 importAtRuntime 的实现变了，请重新适配');
bundled = bundled.replace(runtimeImport, patchedImport);
console.log('  importAtRuntime 改为 __seaRequire');
fs.writeFileSync(entryFile, bundled);

step('生成 SEA blob');
fs.writeFileSync(
  seaConfigFile,
  JSON.stringify(
    { main: entryFile, output: blobFile, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false },
    null,
    2,
  ),
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigFile], { stdio: 'inherit', cwd: root });

step('复制 node.exe 并注入 blob');
fs.copyFileSync(process.execPath, exePath);
execFileSync(
  process.execPath,
  [path.join(root, 'node_modules', 'postject', 'dist', 'cli.js'), exePath, 'NODE_SEA_BLOB', blobFile, '--sentinel-fuse', SEA_FUSE],
  { stdio: 'inherit', cwd: root },
);

step('复制原生依赖到 node_modules');
const nativeRoot = path.join(outDir, 'node_modules');
fs.mkdirSync(nativeRoot, { recursive: true });

const resolveFrom = (specifier, fromDir) =>
  createRequire(path.join(fromDir, '__resolve__.js')).resolve(specifier);

// 从入口文件往上找到 name 匹配的那个 package 目录（sharp 的 exports 不允许直接解析 package.json）
const locateByName = (name, fromDir) => {
  let current = fromDir;
  for (;;) {
    const candidate = path.join(current, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

const locatePackage = (name, fromDir) => {
  try {
    let current = path.dirname(fs.realpathSync(resolveFrom(name, fromDir)));
    while (current !== path.dirname(current)) {
      const packageJson = path.join(current, 'package.json');
      if (fs.existsSync(packageJson) && JSON.parse(fs.readFileSync(packageJson, 'utf8')).name === name) return current;
      current = path.dirname(current);
    }
  } catch {
    // 二进制分发包（如 @img/sharp-win32-x64）的 exports 里没有主入口，解析必然失败，退回目录探测
  }
  const fallback = locateByName(name, fromDir);
  if (fallback) return fallback;
  throw new Error(`找不到包 ${name} 的目录（从 ${fromDir} 解析）`);
};

const copyPackage = (source, name, copied) => {
  fs.cpSync(source, path.join(nativeRoot, name), { recursive: true, dereference: true, force: true });
  copied.push(name);
};

// 把 rootPackage 及其整棵（可选）运行时依赖树搬到 node_modules（扁平化）
const copyDependencyTree = (rootPackage, fromDir, copied) => {
  const base = locatePackage(rootPackage, fromDir);
  if (copied.includes(rootPackage)) return;
  copyPackage(base, rootPackage, copied);
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})];
  for (const name of names) {
    try {
      copyDependencyTree(name, base, copied);
    } catch {
      // 未安装的可选平台包（例如 linux/darwin 版 sharp）跳过
    }
  }
};

const copied = [];
copyDependencyTree('sharp', root, copied);
copyDependencyTree('bcrypt', root, copied);
// TypeORM 运行时用 createRequire(exe 同级的 package.json) 加载驱动，所以 pg 必须落在 exe 同级的 node_modules 里
copyDependencyTree('pg', root, copied);
// file-type 通过 importAtRuntime('strtok3') 动态加载，必须能按包名解析到（strtok3 不是项目直接依赖，从 file-type 目录解析）
copyDependencyTree('strtok3', locatePackage('file-type', root), copied);
copyPackage(locatePackage('swagger-ui-dist', locatePackage('swagger-ui-express', root)), 'swagger-ui-dist', copied);

// 依赖树的失败会被上面的 try/catch 吞掉（跨平台可选包本来就没装），这里对关键依赖做硬校验
const sharpPlatform = `@img/sharp-${process.platform}-${process.arch}`;
const requiredPackages = ['sharp', sharpPlatform, 'bcrypt', 'pg', 'strtok3', 'swagger-ui-dist'];
for (const name of requiredPackages) {
  if (!fs.existsSync(path.join(nativeRoot, name, 'package.json'))) throw new Error(`node_modules 里缺少必需依赖：${name}`);
}
console.log(`  ${copied.join(', ')} → node_modules (${sizeOf(nativeRoot)})`);

step('组装运行目录');
fs.cpSync(path.join(root, 'configs'), path.join(outDir, 'configs'), { recursive: true, force: true });
for (const dir of [
  'adminInfo',
  path.join('uploads', 'images'),
  path.join('uploads', 'avatars'),
  path.join('uploads', 'image_cache'),
  path.join('logs', 'error'),
  path.join('logs', 'combined'),
]) {
  fs.mkdirSync(path.join(outDir, dir), { recursive: true });
}

step('完成');
console.log(`  dist-exe/ ${sizeOf(outDir)}（其中 koharu.exe ${(fs.statSync(exePath).size / 1024 / 1024).toFixed(1)} MB）`);
console.log(`  运行：cd ${path.relative(root, outDir)} && .\\koharu.exe   （配置读 configs/config.yaml，相对当前目录）`);
