import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export default () => {
  const configPath = "./configs";
  if(!fs.existsSync(configPath)){
    fs.mkdirSync(configPath)
  }
  const configFilePath = path.join("./configs", "config.yaml")
  if(!fs.existsSync(configFilePath)){
    
  }
  const config = yaml.load(fs.readFileSync(configFilePath, 'utf8')) as Record<string, any>;
  return config;
};