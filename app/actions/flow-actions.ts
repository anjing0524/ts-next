'use server';
import { format } from 'date-fns';
import logger from '@/utils/logger';
import mysqlPool from '@/lib/instance/mysql-client';
import { PlanConf, PlanState, TaskState } from '@/types/db-types';
import { FlowStage } from '@/app/(dashboard)/flow/store/flow-store';
import { Edge, Node } from '@xyflow/react';
import { TaskConfState, TaskStateDetailType } from '../(dashboard)/flow/types/type';

/**
 * 获取所有有效的计划配置
 * @returns 有效的计划配置列表
 */
export async function getAllPlanConf(): Promise<PlanConf[]> {
  try {
    // 使用 MySQL 连接池执行查询
    const [rows] = await mysqlPool.query(
      `SELECT id, plan_id, time_stage, plan_deps, plan_desc, project
         FROM plan_conf 
         WHERE time_stage IS NOT NULL 
         and project IS NOT NULL 
         and status <> 'OFF' 
         and is_his = 'N'
         and upper(is_efct) = 'Y'
         ORDER BY plan_id ASC`
    );
    // 过滤掉无效的时间阶段
    const validRows = (rows as PlanConf[])
      .filter((row) => row.time_stage !== null && row.time_stage !== '' && row.time_stage !== '-')
      .filter((row) => row.project !== null && row.project !== '' && row.project !== '-');
    return validRows;
  } catch (error) {
    logger.error('获取 plan_conf 失败:', error);
    return []; // 发生错误时返回空
  }
}

/**
 * 获取计划执行状态
 * @param redate 日期
 * @param planIds 选中的计划列表
 * @returns 计划状态列表
 */
export async function getPlanState(redate: string, planIds: string[]): Promise<PlanState[]> {
  try {
    if (planIds.length <= 0) {
      return [];
    }
    // 构建 SQL 查询，使用参数化查询防止 SQL 注入
    const placeholders = planIds.map(() => '?').join(',');
    const query = `
      SELECT ps.*
      FROM plan_state ps
      INNER JOIN (
        SELECT plan_id, MAX(exe_id) as max_exe_id
        FROM plan_state
        WHERE redate = ? 
        AND plan_id IN (${placeholders})
        GROUP BY plan_id
      ) max_ps ON ps.plan_id = max_ps.plan_id AND ps.exe_id = max_ps.max_exe_id
      WHERE ps.redate = ?
    `;
    // 组合所有参数：redate, planIds, 再加一个 redate (用于最外层的 WHERE 条件)
    const params = [redate, ...planIds, redate];
    // 执行查询
    const [rows] = await mysqlPool.query(query, params);
    logger.debug(`查询到 ${(rows as PlanState[]).length} 条计划状态数据`);
    return rows as PlanState[];
  } catch (error) {
    logger.error('获取计划状态失败:', error);
    return [];
  }
}

/**
 * 处理搜索事件的 Server Action
 * @param date 日期
 * @param selectedOptions 选中的项目
 * @returns 流程阶段数据
 */
/**
 * 处理搜索事件的 Server Action
 */
export async function handleSearch(
  date: Date | null,
  selectedOptions: string[] | null
): Promise<FlowStage[] | null> {
  if (!date) return null;
  const dateStr = format(date, 'yyyy-MM-dd');
  // 获取所有计划配置
  const allPlanConfs = await getAllPlanConf();
  // 构建数据映射关系
  const { projectMap, timeStageMap, planIdToTimeStageMap } = buildDataMaps(allPlanConfs); // 在获取计划配置后添加
  // 获取过滤后的计划ID列表
  const allPlanIds = getFilteredPlanIds(projectMap, selectedOptions);
  // 在过滤计划ID后添加
  logger.debug('过滤后计划ID:', allPlanIds);
  // 记录搜索条件
  logger.info(
    `搜索条件: 日期=${dateStr}, ` +
      `计划ID=${allPlanIds.length ? allPlanIds.join(', ') : '未选择'}, ` +
      `计划ID数量=${allPlanIds.length}`
  );
  // 获取计划状态数据
  const planStates = await getPlanState(dateStr, allPlanIds);
  // 创建一个计划ID的集合，用于快速查找
  const filteredPlanIdSet = new Set(allPlanIds);

  // 提前构建每个阶段的计划配置（根据项目过滤）
  const stageConfsMap = new Map<string, PlanConf[]>();
  for (const [stage] of timeStageMap.entries()) {
    // 过滤符合条件的计划配置：
    // 1. 时间阶段匹配
    // 2. 计划ID在过滤后的ID列表中
    const stageConfs = allPlanConfs.filter(
      (conf) => conf.time_stage === stage && filteredPlanIdSet.has(conf.plan_id)
    );
    if (stageConfs.length > 0) {
      stageConfsMap.set(stage, stageConfs);
      logger.debug(`阶段 ${stage} 有 ${stageConfs.length} 个符合条件的计划配置`);
    } else {
      logger.debug(`阶段 ${stage} 没有符合条件的计划配置，跳过`);
    }
  }
  // 生成DAG图数据
  const result: FlowStage[] = [];

  // 遍历每个有效的时间阶段
  for (const [stage, stageConfs] of stageConfsMap.entries()) {
    logger.debug(
      `处理阶段: ${stage}, 包含计划ID: ${stageConfs.map((conf) => conf.plan_id).join(', ')}`
    );
    // 获取该阶段的所有计划状态
    const stageStates = planStates.filter(
      (state) => planIdToTimeStageMap.get(state.plan_id as string) === stage
    );
    logger.debug(`阶段 ${stage} 有 ${stageStates.length} 个计划状态`);
    // 创建plan_id到状态的映射
    const planStateMap = new Map(stageStates.map((state) => [state.plan_id, state]));

    // 生成节点数据
    const nodes = stageConfs.map((conf, index) => {
      // 确保即使没有状态数据也能创建节点
      const state = planStateMap.get(conf.plan_id);
      return createNode(conf, state, index, stage);
    });

    // 并行获取任务详情并补充到节点中
    // if (nodes.length > 0) {
    // 使用Promise.all等待所有节点的任务详情查询完成
    // await enrichNodesWithTaskDetails(nodes, dateStr);
    // }

    // 生成边数据
    const edges = createEdges(stageConfs);
    // 计算统计数据
    const stats = calculateStats(stage, nodes.length, stageStates);
    // 添加到结果数组
    result.push({
      id: stage,
      name: stage,
      nodes,
      edges,
      stats,
    });
    logger.info(`[${stage}] 节点数: ${nodes.length}, 边数: ${edges.length}`);
  }

  // 按照name字段进行升序排序
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

/**
 * 构建数据映射关系
 * @param planConfs 计划配置列表
 * @returns 数据映射关系
 */
function buildDataMaps(planConfs: PlanConf[]) {
  // 项目到计划ID的映射，用于按项目筛选计划
  const projectMap = new Map<string, string[]>();
  // 时间阶段到计划ID的映射，用于按阶段组织计划
  const timeStageMap = new Map<string, string[]>();
  // 计划ID到时间阶段的映射，用于快速查找计划所属阶段
  const planIdToTimeStageMap = new Map<string, string>();

  // 一次遍历构建所有映射
  planConfs.forEach((conf) => {
    const timeStage = `${conf.time_stage}`;
    const project = `${conf.project}`;
    const planId = conf.plan_id;
    // 填充时间阶段分组
    if (!timeStageMap.has(timeStage)) {
      timeStageMap.set(timeStage, []);
    }
    timeStageMap.get(timeStage)?.push(planId);
    // 填充项目分组
    if (!projectMap.has(project)) {
      projectMap.set(project, []);
    }
    projectMap.get(project)?.push(planId);
    // 填充planId到timeStage的映射
    planIdToTimeStageMap.set(planId, timeStage);
  });

  return { projectMap, timeStageMap, planIdToTimeStageMap };
}

/**
 * 获取过滤后的计划ID列表
 * @param projectMap 项目映射
 * @param selectedOptions 选中的项目
 * @returns 过滤后的计划ID列表
 */
function getFilteredPlanIds(
  projectMap: Map<string, string[]>,
  selectedOptions: string[] | null
): string[] {
  if (!selectedOptions || selectedOptions.length === 0) {
    return Array.from(projectMap.values()).flat(); // 获取所有计划ID
  }
  // 获取选中项目的计划ID，并去重
  const selectedPlanIds = Array.from(
    new Set(selectedOptions.flatMap((option) => projectMap.get(option) || []))
  );
  return selectedPlanIds;
}

/**
 * 计算统计数据
 * @param stage 阶段
 * @param nodesCount 节点数量
 * @param stageStates 阶段状态列表
 * @returns 统计数据
 */
/**
 * 计算统计数据
 */
function calculateStats(stage: string, nodesCount: number, stageStates: PlanState[]) {
  return {
    name: stage,
    total: nodesCount,
    // 成功状态：K, D
    success: stageStates.filter((s) => s.plan_state === 'D' || s.plan_state === 'K').length,
    // 失败状态：T, F, Z, C
    failed: stageStates.filter((s) => ['F', 'Z', 'C', 'T'].includes(s.plan_state || '')).length,
    // 运行中状态：P, A, S, R
    running: stageStates.filter((s) => ['R', 'P', 'A', 'S'].includes(s.plan_state || '')).length,
    // 等待中状态已包含在运行中，这里可以保留为空或者移除
    waiting: 0,
  };
}

/**
 * 创建节点
 * @param conf 计划配置
 * @param state 计划状态
 * @param index 索引
 * @returns 节点
 */
/**
 * 创建节点
 */
function createNode(
  conf: PlanConf,
  state: PlanState | undefined,
  index: number,
  timeStage: string
): Node {
  // 状态映射为前端友好的格式
  let status = null;
  if (state) {
    switch (state.plan_state) {
      case 'D':
      case 'K':
        status = 'success';
        break;
      case 'F':
      case 'Z':
      case 'C':
      case 'T':
        status = 'error';
        break;
      case 'R':
      case 'P':
      case 'A':
      case 'S':
        status = 'running';
        break;
      default:
        status = 'waiting';
        break;
    }
  }

  return {
    id: conf.plan_id,
    position: { x: 100 + index * 200, y: 100 },
    type: 'custom',
    data: {
      ...state,
      plan_desc: conf.plan_desc,
      plan_id: conf.plan_id,
      time_stage: timeStage, // 直接使用传入的时间阶段
      // 添加格式化的时间和进度信息
      startTime: state?.start_time ? new Date(state.start_time).toLocaleString() : '未开始',
      endTime: state?.end_time ? new Date(state.end_time).toLocaleString() : '未结束',
      costTime: state?.cost_time ? `${state.cost_time}秒` : '-',
      progress: state?.progress ? `${state.progress}%` : '0%',
      plan_state: state?.plan_state || 'U',
      status: status, // 添加状态字段，便于前端使用
    },
  };
}

/**
 * 创建边
 * @param stageConfs 阶段配置列表
 * @returns 边列表
 */
function createEdges(stageConfs: PlanConf[]): Edge[] {
  const planIdSet = new Set(stageConfs.map((conf) => conf.plan_id));

  return stageConfs.reduce((acc: Edge[], conf) => {
    if (conf.plan_deps) {
      const dependencies = (conf.plan_deps as string)
        .split(',')
        .map((dep) => dep.trim())
        .filter((dep) => planIdSet.has(dep)); // 仅保留本阶段内的依赖

      dependencies.forEach((depId) => {
        acc.push({
          id: `${depId}-${conf.plan_id}`,
          source: depId,
          target: conf.plan_id,
        });
      });
    }
    return acc;
  }, []);
}

/**
 * 获取计划任务详情
 * @param planId 计划ID
 * @param redate 日期
 * @param exeId 执行ID
 * @returns 任务详情列表
 */
export async function getTaskDetails(
  planId: string,
  redate: string,
  exeId: number
): Promise<Array<TaskConfState>> {
  try {
    // 构建 SQL 查询，结合 TaskConf 和 TaskState 的字段
    const query = `
      SELECT 
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
      FROM 
        task_state ts
      JOIN 
        task_conf tc ON ts.task_pk = tc.task_pk
      WHERE 
        ts.plan_id = ? 
        AND ts.redate = ?
        AND ts.exe_id = ?
      ORDER BY 
        ts.start_time ASC, ts.id ASC
    `;

    // 执行查询
    const [rows] = await mysqlPool.query(query, [planId, redate, exeId]);
    logger.debug(`查询到 ${(rows as TaskConfState[]).length} 条任务详情数据`);

    // 处理日期格式，但保持 Date 类型以符合 TaskConfState 接口
    const formattedRows = (rows as TaskConfState[]).map((row) => {
      // 创建格式化后的日期字符串用于显示
      const startTimeStr = row.start_time
        ? format(new Date(row.start_time), 'yyyy-MM-dd HH:mm:ss')
        : null;
      const endTimeStr = row.end_time
        ? format(new Date(row.end_time), 'yyyy-MM-dd HH:mm:ss')
        : null;
      const redateStr = row.redate ? format(new Date(row.redate), 'yyyy-MM-dd') : null;

      return {
        ...row,
        // 添加格式化后的字符串作为新属性
        startTimeFormatted: startTimeStr,
        endTimeFormatted: endTimeStr,
        redateFormatted: redateStr,
        // 保持原始 Date 对象以符合接口要求
      };
    });

    return formattedRows;
  } catch (error) {
    logger.error('获取任务详情失败:', error);
    return [];
  }
}

/**
 * 调用调度系统API的通用函数
 * @param endpoint API端点
 * @param payload 请求负载
 * @returns 操作结果
 */
async function callSchedulerApi(
  endpoint: string,
  payload: { date: string; planId: string; rerunMode: number; param?: string }
): Promise<{ success: boolean; message: string; state: number }> {
  try {
    logger.info(process.env.SCHEDULER_API_URL);
    const response = await fetch(`${process.env.SCHEDULER_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization: `Bearer ${process.env.SCHEDULER_API_KEY || ''}`,
      },
      body: JSON.stringify(payload),
    });

    // 处理网络错误
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`API调用失败: ${response.status} ${response.statusText}, ${errorText}`);
      return {
        success: false,
        message: `API调用失败: ${response.status} ${response.statusText}`,
        state: -1,
      };
    }

    const result = await response.json();
    logger.info(`API返回: ${JSON.stringify(result)}`);

    // 处理API返回结果
    if (result.code === 200) {
      return { success: true, message: result.msg || '操作成功', state: result.state || 0 };
    } else if (result.code === 5001) {
      return {
        success: false,
        message: result.msg || '计划正常执行，无需重跑',
        state: result.state || 1,
      };
    } else if (result.code === 5002) {
      return {
        success: false,
        message: result.msg || '计划正在运行,无需重复执行',
        state: result.state || 2,
      };
    } else if (result.code === 4001) {
      return {
        success: false,
        message: result.msg || '无法关闭调度计划',
        state: result.state || -1,
      };
    } else {
      return {
        success: false,
        message: result.msg || '操作失败，未知错误',
        state: result.state || -1,
      };
    }
  } catch (error) {
    logger.error(`API调用出错:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      state: -1,
    };
  }
}

/**
 * 重跑计划
 * @param planId 计划ID
 * @param redate 日期
 * @param param 可选参数
 * @returns 操作结果
 */
export async function rerunPlan(
  planId: string,
  redate: string,
  param?: string
): Promise<{ success: boolean; message: string; state: number }> {
  try {
    logger.info(`尝试重跑计划: planId=${planId}, redate=${redate}, param=${param || 'None'}`);
    // 构建请求负载
    const payload = {
      date: redate,
      planId,
      rerunMode: 2, // 指定日期计划调度
      param: param || undefined, // 如果没有提供param，则不传此字段
    };
    // 调用通用API函数
    const result = await callSchedulerApi('/tsm/sched/plan/rerun', payload);
    // 自定义成功消息
    if (result.success) {
      result.message = result.message === '操作成功' ? '计划启动成功' : result.message;
    } else {
      result.message = result.message || '重跑计划失败，未知错误';
    }
    return result;
  } catch (error) {
    logger.error(`重跑计划出错:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      state: -1,
    };
  }
}

/**
 * 重跑失败任务
 * @param planId 计划ID
 * @param redate 日期
 * @param exeId 执行ID
 * @param param 可选参数
 * @returns 操作结果
 */
export async function rerunFailedTasks(
  planId: string,
  redate: string,
  exeId: number,
  param?: string
): Promise<{ success: boolean; message: string; state: number }> {
  try {
    logger.info(
      `尝试重跑失败任务: planId=${planId}, redate=${redate}, exeId=${exeId}, param=${param || 'None'}`
    );
    // 构建请求负载
    const payload = {
      date: redate,
      planId,
      rerunMode: 3, // 计划内失败任务重跑调度
      param: param || undefined, // 如果没有提供param，则不传此字段
    };

    // 调用通用API函数
    const result = await callSchedulerApi('/tsm/sched/plan/rerun', payload);
    // 自定义成功消息
    if (result.success) {
      result.message = result.message === '操作成功' ? '失败任务重跑启动成功' : result.message;
    } else {
      result.message = result.message || '重跑失败任务失败，未知错误';
    }
    return result;
  } catch (error) {
    logger.error(`重跑失败任务出错:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      state: -1,
    };
  }
}

/**
 * 停止计划
 * @param planId 计划ID
 * @param redate 日期
 * @param pid 进程ID
 * @returns 操作结果
 */
export async function stopPlan(
  planId: string,
  redate: string,
  pid: string
): Promise<{ success: boolean; message: string; state: number }> {
  try {
    logger.info(`尝试停止计划: planId=${planId}, redate=${redate}, pid=${pid}`);
    // 1. 检查计划是否在运行中
    const [runningPlan] = await mysqlPool.query(
      `SELECT plan_state 
       FROM plan_state 
       WHERE plan_id = ? AND redate = ? AND pid = ?`,
      [planId, redate, pid]
    );

    if (!(runningPlan as PlanState[])[0]) {
      logger.warn(`停止计划失败: 计划 ${planId} 在进程 ${pid} 中不存在`);
      return { success: false, message: '指定的计划执行不存在', state: -1 };
    }

    const planState = (runningPlan as PlanState[])[0].plan_state;
    if (planState && !['R', 'P', 'A', 'S'].includes(planState)) {
      logger.warn(`停止计划失败: 计划 ${planId} 不在运行中，当前状态: ${planState}`);
      return { success: false, message: '只能停止运行中的计划', state: 1 }; // 状态码改为1，表示不在执行状态
    }

    // 2. 调用停止计划API
    const response = await fetch(`${process.env.SCHEDULER_API_URL}/tsm/sched/plan/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization: `Bearer ${process.env.SCHEDULER_API_KEY || ''}`,
      },
      body: JSON.stringify({
        date: redate,
        planId,
        pid, // 使用pid而不是exeId
      }),
    });

    const result = await response.json();
    logger.info(`停止计划API返回: ${JSON.stringify(result)}`);

    // 3. 处理API返回结果
    if (result.code === 200) {
      return {
        success: true,
        message: result.msg || '调度计划关闭中...',
        state: result.state === undefined ? 0 : result.state,
      };
    } else if (result.code === 4001) {
      return {
        success: false,
        message: result.msg || '无法关闭调度计划',
        state: result.state === undefined ? -1 : result.state,
      };
    } else {
      return {
        success: false,
        message: result.msg || '停止计划失败，未知错误',
        state: result.state === undefined ? -1 : result.state,
      };
    }
  } catch (error) {
    logger.error(`停止计划出错:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '未知错误',
      state: -1,
    };
  }
}

/**
 * 根据任务主键获取任务详情
 * @param taskPk 任务主键
 * @returns 任务详情
 */
export async function getTaskInfo(
  taskPk: string | number,
  redate: string,
  exeId: number
): Promise<TaskStateDetailType | null> {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT 
        ts.*
      FROM task_state ts
      WHERE ts.task_pk = ? and ts.redate = ? and ts.exe_id = ?`,
      [taskPk, redate, exeId]
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const taskInfo = rows[0] as TaskState;
      return {
        ...taskInfo,
        startTimeFormatted: taskInfo.start_time
          ? format(taskInfo.start_time, 'yyyy-MM-dd HH:mm:ss')
          : null,
        endTimeFormatted: taskInfo.end_time
          ? format(taskInfo.end_time, 'yyyy-MM-dd HH:mm:ss')
          : null,
        redateFormatted: taskInfo.redate ? format(taskInfo.redate, 'yyyy-MM-dd') : null,
      } as TaskStateDetailType;
    }

    return null;
  } catch (error) {
    logger.error('获取任务详情失败:', error);
    throw new Error('获取任务详情失败');
  }
}
