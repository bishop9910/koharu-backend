// @nestjs/swagger 用 require('swagger-ui-dist/absolute-path.js')() 拿静态资源目录，
// 该目录必须真实存在，否则 /api-doc 页面里的 JS/CSS 全部 404。
const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');

module.exports = function swaggerUiAbsolutePath() {
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'swagger-ui-dist'),
    join(process.cwd(), 'node_modules', 'swagger-ui-dist'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'swagger-ui-bundle.js'))) return candidate;
  }
  throw new Error('找不到 swagger-ui-dist 静态资源目录');
};
