const baseConfig = require('@repo/jest-config/base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      {
        // This setup is crucial for allowing ts-jest to process ESM-style
        // TypeScript files (`.ts` with "type": "module" in package.json)
        // while Jest itself runs in a CommonJS context.
        useESM: true,
      },
    ],
  },
  // This is needed to correctly resolve module imports in ESM-style packages
  moduleNameMapper: {
    '^(\.{1,2}/.*)\\.js$': '$1',
  },
};