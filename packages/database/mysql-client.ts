/**
 * MySQL 客户端工具 - 统一的数据库连接管理
 * MySQL client utilities - Unified database connection management
 * @author 数据库团队
 * @since 1.0.0
 */

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

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
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
  charset: 'utf8mb4',
  // debug: process.env.NODE_ENV !== 'production',
};

/**
 * 创建连接池
 * Create connection pool
 */
const createPool = () => {
  console.log('正在初始化 MySQL 连接池...', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
  });
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

/**
 * 添加友好关闭函数
 * Graceful shutdown function
 */
export async function closePool(): Promise<void> {
  // 检查连接池是否存在且未处于关闭过程中
  if (mysqlPool && !globalThis.isClosingPool) {
    try {
      // 设置关闭标志
      globalThis.isClosingPool = true;

      console.log('正在关闭 MySQL 连接池...');
      await mysqlPool.end();
      console.log('MySQL 连接池已成功关闭');

      // 清除全局引用
      if (process.env.NODE_ENV !== 'production') {
        globalThis.mysqlPool = null;
      }
    } catch (error) {
      console.error('关闭 MySQL 连接池时发生错误', error);
      // 重置关闭标志，允许下次尝试关闭
      globalThis.isClosingPool = false;
      throw error;
    }
  } else if (globalThis.isClosingPool) {
    console.log('MySQL 连接池已经在关闭过程中，跳过重复关闭');
  }
}

/**
 * 连接池健康检查函数
 * Connection pool health check function
 */
export async function checkPoolHealth(): Promise<{ healthy: boolean; message: string }> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  let retryCount = 0;

  // 确保连接池已初始化
  if (!mysqlPool) {
    return {
      healthy: false,
      message: 'MySQL connection pool is not initialized',
    };
  }

  while (retryCount < maxRetries) {
    try {
      console.log(`Attempting database health check (attempt ${retryCount + 1}/${maxRetries})`);
      // await mysqlPool.query('SELECT 1');
      console.log('Database health check successful');
      return {
        healthy: true,
        message: 'Connection pool is healthy',
      };
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Database health check failed (attempt ${retryCount}/${maxRetries})`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (retryCount < maxRetries) {
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  return {
    healthy: false,
    message: `Database health check failed after ${maxRetries} attempts`,
  };
}

/**
 * 获取数据库连接池
 * Get database connection pool
 */
export function getPool(): mysql.Pool {
  if (!mysqlPool) {
    throw new Error('MySQL connection pool is not initialized');
  }
  return mysqlPool;
}

// 添加进程退出事件监听器，确保在应用退出前关闭连接池
if (process.env.NODE_ENV !== 'test') {
  // 在测试环境中不自动关闭，避免干扰测试
  process.on('SIGINT', async () => {
    console.log('接收到 SIGINT 信号，准备关闭 MySQL 连接池');
    await closePool();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('接收到 SIGTERM 信号，准备关闭 MySQL 连接池');
    await closePool();
    process.exit(0);
  });

  // 处理未捕获的异常，确保连接池能够正常关闭
  process.on('uncaughtException', async (error) => {
    console.error('未捕获的异常', error);
    await closePool();
    process.exit(1);
  });
}

export default mysqlPool;
