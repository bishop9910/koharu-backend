// SEA 的 require() 只能加载 Node 内置模块，原生依赖必须从真实磁盘路径加载。
// 打包后它们放在 exe 同级的 node_modules 下；直接跑 bundle 时退回项目根目录。
const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const candidates = [join(dirname(process.execPath), 'package.json'), join(process.cwd(), 'package.json')];

module.exports = function loadNative(id) {
  let lastError;
  for (const base of candidates) {
    try {
      return createRequire(base)(id);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};
