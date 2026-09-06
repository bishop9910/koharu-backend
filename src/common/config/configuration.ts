import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { default_config, type Config } from './default.js';

function deepMerge(defaults: any, overrides: any): any {
  if (Array.isArray(overrides)) {
    return overrides;
  }
  if (
    overrides &&
    typeof overrides === 'object' &&
    defaults &&
    typeof defaults === 'object' &&
    !Array.isArray(defaults)
  ) {
    const result: any = { ...defaults };
    for (const key of Object.keys(overrides)) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    }
    return result;
  }
  return overrides !== undefined ? overrides : defaults;
}

export default () => {
  const configPath = path.resolve(process.cwd(), 'configs');
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath, { recursive: true });
  }
  const configFilePath = path.join(configPath, 'config.yaml');
  if (!fs.existsSync(configFilePath)) {
    const yaml_str = yaml.dump(default_config);
    fs.writeFileSync(configFilePath, yaml_str, 'utf-8');
  }
  const fileConfig = yaml.load(fs.readFileSync(configFilePath, 'utf8')) as Record<string, any>;
  // 老版本 config 缺失的字段回退到默认值，实现向后兼容
  return deepMerge(default_config, fileConfig) as Config;
};
