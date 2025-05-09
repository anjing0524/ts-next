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
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
  debug: process.env.NODE_ENV !== 'production',
};

// 创建连接池
const createPool = () => {
  logger.info('正在初始化 MySQL 连接池...', {
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
    // 记录查询开始
    const startTime = Date.now();
    logger.debug('执行 SQL 查询', { sql, params });

    // 获取连接并执行查询
    const connection = await mysqlPool.getConnection();
    try {
      const [rows] = await connection.execute(sql, params);

      // 记录查询完成
      const endTime = Date.now();
      const duration = endTime - startTime;
      logger.debug('SQL 查询完成', {
        sql,
        params,
        duration: `${duration}ms`,
        rowCount: Array.isArray(rows) ? rows.length : 0,
      });

      return rows as T[];
    } catch (error) {
      // 记录查询错误
      logger.error('SQL 查询失败', {
        sql,
        params,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // 重新抛出错误，让调用者处理
    } finally {
      connection.release(); // 确保连接被释放
    }
  } catch (error) {
    // 记录连接错误
    logger.error('获取数据库连接失败', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error; // 重新抛出错误，让调用者处理
  }
}

// 添加连接池健康检查函数
export async function checkPoolHealth(): Promise<boolean> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      logger.info(`Attempting database health check (attempt ${retryCount + 1}/${maxRetries})`);
      const connection = await mysqlPool.getConnection();
      try {
        await connection.query('SELECT 1');
        logger.info('Database health check successful');
        return true;
      } finally {
        connection.release();
      }
    } catch (error) {
      retryCount++;
      logger.error(`Database health check failed (attempt ${retryCount}/${maxRetries})`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      if (retryCount < maxRetries) {
        logger.info(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  logger.error(`Database health check failed after ${maxRetries} attempts`);
  return false;
}

export default mysqlPool;
