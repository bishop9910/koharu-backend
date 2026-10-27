// 打包产物冒烟：直接打 dist-exe/koharu.exe，覆盖 bcrypt / sharp / pg / swagger-ui 四条
// 原生模块或磁盘依赖路径。先在 dist-exe 下启动 exe，再在项目根目录运行本脚本：
//   node scripts/smoke-packaged.mjs
import { createHmac } from 'node:crypto';
import fs from 'node:fs';

const base = 'http://127.0.0.1:3000';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
};

const configRaw = fs.readFileSync('dist-exe/configs/config.yaml', 'utf8');
const tokenKey = /key:\s*"?([^"\s]+)"?/.exec(configRaw)[1];
const adminId = '6253a9c8-5067-4242-ae5a-33962ce91293';

const mint = (sub) => {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub, iat: now, exp: now + 3600 })).toString('base64url');
  const sig = createHmac('sha256', tokenKey).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

const json = async (url, options) => {
  const response = await fetch(`${base}${url}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: response.status, headers: response.headers, data, text };
};

const boot = Date.now();
let ready = false;
while (Date.now() - boot < 60000) {
  try {
    const probe = await fetch(`${base}/api`);
    if (probe.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
check('服务启动 GET /api', ready);

const root = await json('/api');
check('GET /api 200', root.status === 200, root.text.slice(0, 60));

const tags = await json('/api/tags');
check('GET /api/tags 200 JSON 数组', tags.status === 200 && Array.isArray(tags.data), `len=${Array.isArray(tags.data) ? tags.data.length : 'n/a'}`);

const swaggerUi = await json('/api-doc');
check('GET /api-doc 返回 HTML', swaggerUi.status === 200 && /swagger-ui/.test(swaggerUi.text), `len=${swaggerUi.text.length}`);

const spec = await json('/api-doc-json');
check('GET /api-doc-json 可解析', spec.status === 200 && !!spec.data?.paths, `paths=${Object.keys(spec.data?.paths ?? {}).length}`);

const login = await json('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test1', password: '123456' }),
});
check('bcrypt 校验（登录 test1）', login.status === 200 && !!login.data?.accessToken, `status=${login.status}`);
const token = login.data?.accessToken;

const admin = mint(adminId);
const pending = await json('/api/images/pending?limit=1', { headers: { Authorization: `Bearer ${admin}` } });
check('pg 驱动 + admin token 查待审核队列', pending.status === 200, `status=${pending.status} total=${pending.data?.total}`);

const library = await json('/api/library/status', { headers: { Authorization: `Bearer ${admin}` } });
check('GET /api/library/status', library.status === 200, JSON.stringify(library.data).slice(0, 100));

// 图库锁定时上传会被 503 挡住；密码由 seed 写进 adminInfo/info.json，这里读出来解锁
if (library.data && library.data.unlocked === false) {
  const info = JSON.parse(fs.readFileSync('dist-exe/adminInfo/info.json', 'utf8'));
  const password = info.library?.password ?? info.libraryPassword;
  const unlock = await json('/api/library/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
    body: JSON.stringify({ password }),
  });
  check('用 info.json 里的图库密码解锁', unlock.status === 200 || unlock.status === 201, `status=${unlock.status}`);
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'probe.png');
const upload = await json('/api/images', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
const imageId = upload.data?.image?.id;
check('sharp 处理上传（AES-GCM 封装 + 缩略图）', upload.status === 201 && !!imageId, `status=${upload.status} id=${imageId}`);

if (imageId) {
  const thumb = await fetch(`${base}/api/images/${imageId}/thumbnail`, { headers: { Authorization: `Bearer ${token}` } });
  check(
    'sharp 解密 + 缩略图流',
    thumb.status === 200 && thumb.headers.get('content-type') === 'image/webp',
    `status=${thumb.status} type=${thumb.headers.get('content-type')}`,
  );
  const remove = await json(`/api/images/${imageId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  check('删除测试图', remove.status === 200, `status=${remove.status}`);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length === 0 ? 0 : 1);
