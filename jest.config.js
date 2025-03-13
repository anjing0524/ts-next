const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // 指向Next.js应用的路径
  dir: './',
});

// Jest配置
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
};

// createJestConfig会自动处理一些Next.js特定的配置
module.exports = createJestConfig(customJestConfig);