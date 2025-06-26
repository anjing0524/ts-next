const { base } = require('@repo/jest-config');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  // 根目录特有的配置
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // 项目特定的覆盖率收集配置
  collectCoverageFrom: [
    ...base.collectCoverageFrom,
    'packages/lib/src/**/*.{js,ts}',
  ],
}; 