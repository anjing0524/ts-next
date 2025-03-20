import { NextResponse } from 'next/server';
import mysqlPool from '@/lib/instance/mysql-client';
import logger from '@/utils/logger';
import { TaskConfState } from '@/app/(dashboard)/flow/types/type';
import { format } from 'date-fns';
/**
 * 获取计划任务详情
 * @param planId 计划ID
 * @param redate 日期
 * @param exeId 执行ID
 * @returns 任务详情列表
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId');
    const redate = searchParams.get('redate');
    const exeId = searchParams.get('exeId');

    if (!planId || !redate || !exeId) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }
    const [rows] = await mysqlPool.query(
      `SELECT 
        ts.id,
        ts.redate,
        ts.task_pk,
        tc.task_id,
        tc.task_desc,
        ts.plan_id,
        tc.task_deps,
        tc.task_type,
        tc.exec_cmd,
        tc.tgt_db,
        tc.pory,
        tc.is_retry,
        ts.exe_id,
        ts.task_state,
        ts.start_time,
        ts.end_time,
        ts.cost_time,
        ts.exec_desc,
        ts.ret_value
      FROM task_state ts
      JOIN task_conf tc ON ts.task_pk = tc.task_pk
      WHERE ts.plan_id = ? AND ts.redate = ? AND ts.exe_id = ?
      ORDER BY ts.start_time ASC, ts.id ASC`,
      [planId, redate, exeId]
    );
    const formattedRows = (rows as TaskConfState[]).map((row) => ({
      ...row,
      startTimeFormatted: row.start_time ? format(row.start_time, 'yyyy-MM-dd HH:mm:ss') : null,
      endTimeFormatted: row.end_time ? format(row.end_time, 'yyyy-MM-dd HH:mm:ss') : null,
      redateFormatted: row.redate ? format(row.redate, 'yyyy-MM-dd') : null, // 日期部分单独格式化
    }));
    logger.info('API 请求成功,数据长度' + formattedRows.length);
    return NextResponse.json(formattedRows as TaskConfState[], { status: 200 });
  } catch (error) {
    logger.error('API 请求失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
