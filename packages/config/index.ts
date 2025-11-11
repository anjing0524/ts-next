import * as defaultConfig from './default.json';
import * as developmentConfig from './development.json';
import * as productionConfig from './production.json';

interface AppConfig {
  api: {
    baseUrl: string;
  };
  database: {
    type: string;
    host: string;
    name?: string;
  };
}

const env = process.env.NODE_ENV || 'development';

let config: AppConfig = defaultConfig as AppConfig;

if (env === 'development') {
  config = { ...config, ...developmentConfig };
} else if (env === 'production') {
  config = { ...config, ...productionConfig };
}

// 可以在这里添加加载 local.json 的逻辑，但需要确保它不会被提交到版本控制
// try {
//   const localConfig = require('./local.json');
//   config = { ...config, ...localConfig };
// } catch (e) {
//   // local.json might not exist, which is fine
// }

export default config;
