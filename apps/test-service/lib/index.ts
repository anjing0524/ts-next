/**
 * test-service lib 导出入口
 * 统一导出工具函数，支持 @/lib 导入方式
 */

export { default as logger } from './utils/logger';
export { getTimeWheelInstance, default as TimeWheel } from './utils/time-wheel';
