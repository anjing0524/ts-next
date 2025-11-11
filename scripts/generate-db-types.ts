import { mysqlPool, dbConfig } from '@repo/database';
import logger from '@/lib/utils/logger';
import fs from 'fs/promises';
import path from 'path';
export async function generateTableTypes() {
  try {
    const connection = await mysqlPool.getConnection();
    logger.info('开始生成数据库表结构类型定义');

    // 获取所有表名
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [dbConfig.database]
    );
    let typeDefinitions = `// 自动生成的数据库表结构类型定义\n// 生成时间: ${new Date().toISOString()}\n\n`;
    // 遍历每个表生成类型定义
    for (const table of tables as any[]) {
      const tableName = table.TABLE_NAME;
      // 获取表字段信息
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT 
           FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
        [dbConfig.database, tableName]
      );
      // 生成接口定义
      typeDefinitions += `export interface ${toPascalCase(tableName)} {\n`;
      for (const column of columns as any[]) {
        const columnName = column.COLUMN_NAME;
        const dataType = mapMySQLTypeToTS(column.DATA_TYPE);
        const isNullable = column.IS_NULLABLE === 'YES' ? ' | null' : '';
        const comment = column.COLUMN_COMMENT ? ` // ${column.COLUMN_COMMENT}` : '';
        typeDefinitions += `  ${columnName}: ${dataType}${isNullable};${comment}\n`;
      }
      typeDefinitions += `}\n\n`;
    }
    // 写入类型定义文件
    const typesDir = path.join(process.cwd(), 'types');
    await fs.mkdir(typesDir, { recursive: true });
    await fs.writeFile(path.join(typesDir, 'db-types.ts'), typeDefinitions);
    logger.info('数据库表结构类型定义生成完成');
    connection.release();
  } catch (error) {
    logger.error('生成数据库表结构类型定义失败', error);
  }
}

// 辅助函数：将表名转换为 PascalCase
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// 辅助函数：将 MySQL 数据类型映射到 TypeScript 类型
function mapMySQLTypeToTS(mysqlType: string): string {
  const typeMap: Record<string, string> = {
    int: 'number',
    tinyint: 'number',
    smallint: 'number',
    mediumint: 'number',
    bigint: 'number',
    float: 'number',
    double: 'number',
    decimal: 'number',
    varchar: 'string',
    char: 'string',
    text: 'string',
    tinytext: 'string',
    mediumtext: 'string',
    longtext: 'string',
    date: 'Date',
    datetime: 'Date',
    timestamp: 'Date',
    time: 'string',
    year: 'number',
    blob: 'Buffer',
    tinyblob: 'Buffer',
    mediumblob: 'Buffer',
    longblob: 'Buffer',
    json: 'Record<string, any>',
    enum: 'string',
    set: 'string[]',
    boolean: 'boolean',
    bool: 'boolean',
  };

  return typeMap[mysqlType.toLowerCase()] || 'any';
}
async function main() {
  await generateTableTypes();
  process.exit(0);
}

main().catch(console.error);
