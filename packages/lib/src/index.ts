// lib包统一索引文件
// 按需聚合browser/node/types等导出

// 浏览器环境导出
export * from './browser';
// Node环境导出（仅供node端直接import '@repo/lib/node'使用）
// export * from './node';
// 类型定义
export * from './types';

// 版本信息
export const LIB_VERSION = '1.0.0';
