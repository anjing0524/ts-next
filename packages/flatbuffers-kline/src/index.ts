/**
 * FlatBuffers K线数据类型定义
 * 自动生成的 TypeScript 类型，用于序列化和反序列化 K线数据
 */

// 导出主要的 K线数据类型
export * from './kline';

// 导出具体的数据结构
export * from './kline/kline-data';
export * from './kline/kline-item';
export * from './kline/price-volume';

// 重新导出常用类型以便使用
export { KlineData } from './kline/kline-data';
export { KlineItem } from './kline/kline-item';
export { PriceVolume } from './kline/price-volume';

/**
 * K线数据相关的常量和工具函数
 */
export const KLINE_FILE_IDENTIFIER = 'KLI1';

/**
 * K线数据类型枚举
 */
export enum KlineTimeframe {
  MINUTE_1 = '1m',
  MINUTE_5 = '5m',
  MINUTE_15 = '15m',
  MINUTE_30 = '30m',
  HOUR_1 = '1h',
  HOUR_4 = '4h',
  DAY_1 = '1d',
  WEEK_1 = '1w',
  MONTH_1 = '1M'
}

/**
 * 数据同步状态
 */
export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

/**
 * WebSocket 消息类型
 */
export enum MessageType {
  GET_INITIAL_DATA = 'get_initial_data',
  DATA_SYNC = 'data_sync',
  MISSING_DATA_REQUEST = 'missing_data_request',
  PING = 'ping',
  PONG = 'pong',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  ERROR = 'error'
}