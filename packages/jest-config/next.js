const nextJest = require('next/jest');
const baseConfig = require('./base');

/**
 * 创建Next.js专用的Jest配置
 * @param {string} dir - Next.js应用目录路径
 * @returns {Function} Jest配置创建函数
 */
function createNextJestConfig(dir = './') {
  const createJestConfig = nextJest({ dir });
  
  return (customConfig = {}) => {
    const config = {
      ...baseConfig,
      // 模块路径映射 (支持 @ 别名)
      moduleNameMapping: {
        '^@/(.*)$': `<rootDir>/${dir}$1`,
      },
      // 设置文件
      setupFilesAfterEnv: [`<rootDir>/${dir}jest.setup.ts`],
      ...customConfig,
    };
    
    return createJestConfig(config);
  };
}

module.exports = { createNextJestConfig }; 