import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { default_config, type Config} from './default.js';

export default () => {
  const configPath = path.resolve(process.cwd(), 'configs')
  if(!fs.existsSync(configPath)){
    fs.mkdirSync(configPath, { recursive: true })
  }
  const configFilePath = path.join(configPath, "config.yaml")
  if(!fs.existsSync(configFilePath)){
    const yaml_str = yaml.dump(default_config)
    fs.writeFileSync(configFilePath, yaml_str, 'utf-8');
  }
  const config = yaml.load(fs.readFileSync(configFilePath, 'utf8')) as Config;
  return config;
};