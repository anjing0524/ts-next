import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse';
import logger from '@/lib/utils/logger';
// 使用 lib 下的 MySQL 连接池
import pool from '@/lib/instance/mysql-client';

// CSV 文件到数据库表的映射
const CSV_TO_TABLE_MAP = {
  'dataalchemist_plan_conf.csv': 'plan_conf',
  'dataalchemist_plan_state.csv': 'plan_state',
  'dataalchemist_task_conf.csv': 'task_conf',
  'dataalchemist_task_state.csv': 'task_state',
} as const;

// 转换日期字符串为 Date 对象
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// 数据类型转换配置
const DATA_TYPE_CONVERTERS: Record<string, Record<string, (value: string) => any>> = {
  plan_conf: {
    id: (val) => (val ? parseInt(val) : null),
    group_id: (val) => (val ? parseInt(val) : null),
    date_type: (val) => (val ? parseInt(val) : null),
    lock_ver: (val) => (val ? parseInt(val) : null),
    create_time: parseDate,
    update_time: parseDate,
  },
  plan_state: {
    exe_id: (val) => (val ? parseInt(val) : null),
    exec_mode: (val) => (val ? parseInt(val) : null),
    total_task: (val) => (val ? parseInt(val) : null),
    finish_task: (val) => (val ? parseInt(val) : null),
    progress: (val) => (val ? parseFloat(val) : null),
    cost_time: (val) => (val ? parseFloat(val) : null),
    redate: parseDate,
    start_time: parseDate,
    end_time: parseDate,
  },
  task_conf: {
    id: (val) => (val ? parseInt(val) : null),
    group_id: (val) => (val ? parseInt(val) : null),
    task_type: (val) => (val ? parseInt(val) : null),
    pory: (val) => (val ? parseInt(val) : null),
    lock_ver: (val) => (val ? parseInt(val) : null),
    create_time: parseDate,
    update_time: parseDate,
  },
  task_state: {
    exe_id: (val) => (val ? parseInt(val) : null),
    cost_time: (val) => (val ? parseFloat(val) : null),
    redate: parseDate,
    start_time: parseDate,
    end_time: parseDate,
  },
};

// CSV 列定义映射
const CSV_COLUMNS_MAP = {
  'dataalchemist_plan_conf.csv': [
    'id',
    'group_id',
    'plan_id',
    'plan_desc',
    'time_stage',
    'plan_deps',
    'date_type',
    'cron_str',
    'is_block_skip',
    'is_paused_skip',
    'is_efct',
    'is_his',
    'status',
    'create_time',
    'update_time',
    'create_user',
    'update_user',
    'update_proj_ver',
    'lock_ver',
  ],
  'dataalchemist_plan_state.csv': [
    'redate',
    'plan_id',
    'plan_desc',
    'exe_id',
    'params',
    'exec_mode',
    'plan_state',
    'start_time',
    'end_time',
    'cost_time',
    'total_task',
    'finish_task',
    'progress',
    'exec_desc',
    'pid',
  ],
  'dataalchemist_task_conf.csv': [
    'id',
    'group_id',
    'task_pk',
    'task_id',
    'task_desc',
    'plan_id',
    'task_deps',
    'task_type',
    'exec_cmd',
    'tgt_db',
    'pory',
    'is_retry',
    'is_his',
    'status',
    'create_time',
    'update_time',
    'create_user',
    'update_user',
    'update_proj_ver',
    'lock_ver',
  ],
  'dataalchemist_task_state.csv': [
    'redate',
    'task_pk',
    'task_id',
    'plan_id',
    'exec_cmd',
    'exe_id',
    'task_state',
    'start_time',
    'end_time',
    'cost_time',
    'exec_desc',
    'ret_value',
  ],
} as const;

// 修改读取并解析 CSV 文件的函数，直接返回数组
async function parseCsvFile(filePath: string): Promise<string[][]> {
  const fileContent = await fs.readFile(filePath, 'utf-8');

  return new Promise((resolve, reject) => {
    parse(
      fileContent,
      {
        skip_empty_lines: true,
        trim: true,
        delimiter: ',', // 明确指定分隔符
      },
      (err: any, records: string[][]) => {
        if (err) reject(err);
        else resolve(records);
      }
    );
  });
}

// 转换数据类型
function convertRowDataTypes(row: string[], columns: string[], tableName: string): any[] {
  const converters = DATA_TYPE_CONVERTERS[tableName];
  if (!converters) return row;

  return row.map((value, index) => {
    const columnName = columns[index];
    const converter = converters[columnName];
    return converter ? converter(value) : value;
  });
}

// 清空表
async function truncateTable(connection: any, tableName: string) {
  await connection.query(`TRUNCATE TABLE ${tableName}`);
  logger.info(`已清空表 ${tableName}`);
}

// 优化的批量插入数据函数
async function batchInsert(
  connection: any,
  tableName: string,
  columns: string[],
  records: string[][],
  batchSize = 1000
) {
  if (records.length === 0) return;

  // 构建多行插入语句，提高插入效率
  const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`;
  // 分批处理
  for (let i = 0; i < records.length; i += batchSize) {
    const startTime = Date.now();
    const batch = records.slice(i, i + batchSize);
    const currentBatchSize = batch.length;

    // 为当前批次构建占位符
    const currentPlaceholders = Array(currentBatchSize).fill(rowPlaceholders).join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${currentPlaceholders}`;

    // 转换数据类型并准备值
    const values = [];
    for (const row of batch) {
      const convertedRow = convertRowDataTypes(row, columns, tableName);
      values.push(...convertedRow);
    }

    await connection.query(sql, values);

    const endTime = Date.now();
    const timeUsed = (endTime - startTime) / 1000;
    logger.info(
      `已插入 ${i + batch.length}/${records.length} 条记录到 ${tableName}，耗时 ${timeUsed.toFixed(2)}s`
    );
  }
}

// 修改导入数据函数
async function importData() {
  let connection = null;

  try {
    logger.info('开始导入测试数据');
    // 获取连接并开始事务
    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const [csvFile, tableName] of Object.entries(CSV_TO_TABLE_MAP)) {
      const filePath = path.join(process.cwd(), 'scripts', 'test-data', csvFile);
      logger.info(`正在处理文件: ${csvFile}`);
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch (error) {
        logger.warn(`文件不存在: ${filePath}，跳过处理`);
        continue;
      }
      // 清空表
      await truncateTable(connection, tableName);
      // 获取列定义
      const columns = CSV_COLUMNS_MAP[csvFile as keyof typeof CSV_COLUMNS_MAP];
      // 解析 CSV 文件
      const records = await parseCsvFile(filePath);
      // 跳过标题行（如果有）
      const dataRows = records[0].join('') === columns.join('') ? records.slice(1) : records;
      if (dataRows.length === 0) {
        logger.warn(`文件 ${csvFile} 没有数据行，跳过导入`);
        continue;
      }
      // 批量插入数据
      await batchInsert(connection, tableName, columns as unknown as string[], dataRows);
      logger.info(`成功导入 ${dataRows.length} 条记录到 ${tableName}`);
    }

    // 提交事务
    await connection.commit();
    logger.info('所有测试数据导入完成');
  } catch (error) {
    // 回滚事务
    if (connection) {
      await connection.rollback();
    }
    logger.error('导入测试数据失败', error);
    throw error;
  } finally {
    // 释放连接
    if (connection) {
      connection.release();
    }
  }
}

// 执行导入
async function main() {
  const startTime = Date.now();

  try {
    await importData();
    const endTime = Date.now();
    const timeUsed = (endTime - startTime) / 1000;
    logger.info(`导入完成，总耗时: ${timeUsed.toFixed(2)}s`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    // 关闭连接池
    await pool.end();
  }
  process.exit(0);
}

main();
