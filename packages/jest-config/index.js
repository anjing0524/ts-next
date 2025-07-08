// 导出基础配置
const base = require('./base.cjs');

// 导出Next.js配置
const { createNextJestConfig } = require('./next');

module.exports = {
  base,
  createNextJestConfig,
};