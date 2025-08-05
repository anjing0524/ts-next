const nextJest = require('next/jest');
const baseConfig = require('./base.cjs');

function createNextJestConfig(dir = './') {
  const createJestConfig = nextJest({ dir });

  return (customConfig = {}) => {
    const config = {
      ...baseConfig,
      moduleNameMapper: {
        '^@/(.*)$': `<rootDir>/$1`,
      },
      setupFilesAfterEnv: [`<rootDir>/jest.setup.ts`],
      ...customConfig,
    };

    return createJestConfig(config);
  };
}

module.exports = { createNextJestConfig };
