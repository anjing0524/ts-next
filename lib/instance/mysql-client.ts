import logger from '@/utils/logger';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

// 声明全局变量类型
declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: mysql.Pool | null;
  // eslint-disable-next-line no-var
  var isClosingPool: boolean; // 添加关闭标志
}

// 创建连接池配置
export const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'mydb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// 创建连接池
const createPool = () => {
  logger.info('MySQL 连接池已初始化');
  return mysql.createPool(dbConfig);
};

// 使用 globalThis 来存储连接池，避免热重载时重复初始化
const mysqlPool = globalThis.mysqlPool || createPool();

// 初始化关闭标志
if (globalThis.isClosingPool === undefined) {
  globalThis.isClosingPool = false;
}

// 只在非生产环境下将实例挂载到 globalThis 上
if (process.env.NODE_ENV !== 'production') {
  globalThis.mysqlPool = mysqlPool;
}

// 添加友好关闭函数
export async function closePool(): Promise<void> {
  // 检查连接池是否存在且未处于关闭过程中
  if (mysqlPool && !globalThis.isClosingPool) {
    try {
      // 设置关闭标志
      globalThis.isClosingPool = true;

      logger.info('正在关闭 MySQL 连接池...');
      await mysqlPool.end();
      logger.info('MySQL 连接池已成功关闭');

      // 清除全局引用
      if (process.env.NODE_ENV !== 'production') {
        globalThis.mysqlPool = null;
      }
    } catch (error) {
      logger.error('关闭 MySQL 连接池时发生错误', error);
      // 重置关闭标志，允许下次尝试关闭
      globalThis.isClosingPool = false;
      throw error;
    }
  } else if (globalThis.isClosingPool) {
    logger.info('MySQL 连接池已经在关闭过程中，跳过重复关闭');
  }
}

// 添加进程退出事件监听器，确保在应用退出前关闭连接池
if (process.env.NODE_ENV !== 'test') {
  // 在测试环境中不自动关闭，避免干扰测试
  process.on('SIGINT', async () => {
    logger.info('接收到 SIGINT 信号，准备关闭 MySQL 连接池');
    await closePool();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('接收到 SIGTERM 信号，准备关闭 MySQL 连接池');
    await closePool();
    process.exit(0);
  });

  // 处理未捕获的异常，确保连接池能够正常关闭
  process.on('uncaughtException', async (error) => {
    logger.error('未捕获的异常', error);
    await closePool();
    process.exit(1);
  });
}

// 创建一个简单的查询辅助函数
export async function query<T = unknown>(
  sql: string,
  params?: Array<string | number | boolean | null>
): Promise<T[]> {
  try {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows as T[];
  } catch (error) {
    logger.error('数据库查询失败', { sql, error });
    return [];
  }
}

export default mysqlPool;
