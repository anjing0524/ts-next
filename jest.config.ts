/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
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
  
  // 模块名映射（路径别名）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  
  // 设置文件
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  
  // 测试环境变量
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  
  // 转换忽略模式 - 允许转换jose等ES模块
  transformIgnorePatterns: [
    'node_modules/(?!(jose|@panva/hkdf|preact-render-to-string|@babel/runtime)/)',
  ],
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // ES模块支持
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  
  // 测试超时时间（30秒，适合数据库操作）
  testTimeout: 30000,
  
  // 最大并发数（避免数据库连接问题）
  maxWorkers: 1,
  
  // 详细输出
  verbose: true,
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
