const nextConfig = require('@repo/eslint-config/next');

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...nextConfig,
  root: true,
}; 