/** @type {import('jest').Config} */
module.exports = {
  // 使用Node环境进行测试
  testEnvironment: 'node',
  
  // 自动清理mock调用、实例、上下文和结果
  clearMocks: true,
  
  // 收集覆盖率信息
  collectCoverage: true,
  
  // 使用v8作为覆盖率提供器
  coverageProvider: 'v8',
  
  // 覆盖率输出目录
  coverageDirectory: 'coverage',
  
  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 覆盖率收集的文件模式
  collectCoverageFrom: [
    'lib/**/*.{js,ts}',
    'src/**/*.{js,ts}',
    'app/**/*.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  
  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.test.{js,ts}',
    '**/?(*.)+(spec|test).{js,ts}',
  ],
  
  // 测试环境变量
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  
  // 转换忽略模式 - 允许转换jose等ES模块
  transformIgnorePatterns: [
    '/node_modules/(?!(jose|@panva/hkdf|@babel/runtime))/',
  ],
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'mjs'],
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts'],
}; 