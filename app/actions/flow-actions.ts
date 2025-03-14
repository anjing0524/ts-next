'use server';
import { format } from 'date-fns';
import logger from '@/utils/logger';
import mysqlPool from '@/lib/instance/mysql-client';
import { PlanConf, PlanState } from '@/types/db-types';
import { PlanStateWithTimeStage } from '../(dashboard)/flow/types/type';
import { FlowStage } from '@/app/(dashboard)/flow/store/flow-store';
import { Edge } from '@xyflow/react';

// 获取所有有效的服务器配置
export async function getAllPlanConf() {
  try {
    // 使用 MySQL 连接池执行查询
    const [rows] = await mysqlPool.query(
      `SELECT id, plan_id, time_stage, plan_deps, plan_desc, project
         FROM plan_conf 
         WHERE time_stage IS NOT NULL 
         and project IS NOT NULL 
         and status <> 'OFF' 
         and is_his = 'N'
         and upper(is_efct) = 'Y'`
    );
    // 过滤掉无效的时间阶段
    const validRows = (rows as PlanConf[])
      .filter((row) => row.time_stage !== null && row.time_stage !== '' && row.time_stage !== '-')
      .filter((row) => row.project !== null && row.project !== '' && row.project !== '-');
    return validRows;
  } catch (error) {
    console.error('获取 plan_conf 失败:', error);
    return []; // 发生错误时返回空
  }
}
/**
 * 获取计划执行状态
 * @param redate 日期
 * @param planIds 选中的计划列表
 * @returns
 */
export async function getPlanState(redate: string, planIds: string[]) {
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
 */
export async function handleSearch(
  date: Date | null,
  selectedOptions: string[] | null
): Promise<FlowStage[] | null> {
  if (!date) return null;
  const dateStr = format(date, 'yyyy/MM/dd');
  // 创建 Map: project => plan_id[]
  const projectMap = new Map<string, string[]>();
  // 创建 Map: time_stage -> plan_id[]
  const timeStageMap = new Map<string, string[]>();
  const allPlanConfs = await getAllPlanConf();
  // 遍历结果，将 plan_id 按 time_stage 分组
  allPlanConfs.forEach((row) => {
    const timeStage = row.time_stage as string;
    const project = row.project as string;
    const planId = row.plan_id;
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
  });

  // 创建MAP: plan_id -> time_stage
  const planIdToTimeStageMap = new Map<string, string>();
  allPlanConfs.forEach((row) => {
    const planId = row.plan_id;
    const timeStage = row.time_stage as string;
    planIdToTimeStageMap.set(planId, timeStage);
  });

  // 获取计划ID：如果未选择则获取所有，否则获取选中的
  const allPlanIds =
    !selectedOptions || selectedOptions.length === 0
      ? Array.from(projectMap.values()).flat() // 获取所有计划ID
      : selectedOptions.flatMap((option) => projectMap.get(option) || []); // 获取选中的计划ID

  // 记录搜索条件
  logger.info(
    `搜索条件: 日期=${dateStr}, ` +
      `计划ID=${allPlanIds?.length ? allPlanIds.join(', ') : '未选择'}, ` +
      `计划ID数量=${allPlanIds.length}`
  );
  const planStates = await getPlanState(dateStr, allPlanIds);

  // 按 time_stage 分组（需要从 planConfs 中获取对应的 time_stage）
  const groupedByStage = new Map<string, PlanStateWithTimeStage[]>();
  planStates.forEach((state) => {
    // 查找对应的配置项获取 time_stage
    const stage = planIdToTimeStageMap.get(state.plan_id as string);
    if (!stage) {
      logger.warn(`未找到 plan_id=${state.plan_id} 的 time_stage`);
      return;
    }
    if (!groupedByStage.has(stage)) {
      groupedByStage.set(stage, []);
    }
    groupedByStage.get(stage)?.push({ ...state, time_stage: stage });
  });

  // 记录分组统计信息
  logger.info(`计划状态数据分组统计：`);
  groupedByStage.forEach((states, stage) => {
    logger.info(`- ${stage}: ${states.length} 条`);
  });
  // 根据分组数据计算状态统计
  const stageStats = new Map<
    string,
    {
      total: number;
      success: number;
      failed: number;
      running: number;
      waiting: number;
    }
  >();

  groupedByStage.forEach((states, stage) => {
    stageStats.set(stage, {
      total: states.length,
      success: states.filter((s) => s.plan_state === 'D').length,
      failed: states.filter((s) => s.plan_state === 'F').length,
      running: states.filter((s) => s.plan_state === 'R').length,
      waiting: states.filter((s) => s.plan_state === 'P' || s.plan_state === 'Z').length,
    });
  });
  // 生成DAG图数据
  const dagData = Array.from(groupedByStage).map(([stage, states]) => {
    // 生成节点数据（结合状态信息）
    const nodes = states.map((state, index) => {
      // 状态映射为前端友好的格式
      let status = null;
      switch (state.plan_state) {
        case 'D':
          status = 'success';
          break;
        case 'F':
          status = 'error';
          break;
        case 'R':
          status = 'running';
          break;
        case 'P':
        case 'Z':
          status = 'waiting';
          break;
      }

      return {
        id: state.plan_id || `node-${index}`, // 确保id不为null
        label: `${state.plan_id}\n${state.plan_desc || ''}`,
        status,
        // 添加必需的position属性
        position: { x: 100 + index * 200, y: 100 },
        // 添加type属性，与flow-store中的设置保持一致
        type: 'custom',
        data: {
          ...state,
          // 添加格式化的时间和进度信息
          startTime: state.start_time ? new Date(state.start_time).toLocaleString() : '未开始',
          endTime: state.end_time ? new Date(state.end_time).toLocaleString() : '未结束',
          costTime: state.cost_time ? `${state.cost_time}秒` : '-',
          progress: state.progress ? `${state.progress}%` : '0%',
        },
      };
    });

    // 获取当前阶段的所有计划配置
    const stageConfs = allPlanConfs.filter((conf) => conf.time_stage === stage);
    const planIdSet = new Set(stageConfs.map((conf) => conf.plan_id));
    // 生成边数据（处理依赖关系）
    const edges = stageConfs.reduce((acc: Edge[], conf) => {
      if (conf.plan_deps) {
        const dependencies = conf.plan_deps
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
    logger.info(`${JSON.stringify(edges)}`);
    logger.info(`[${stage}] 节点数: ${nodes.length}, 边数: ${edges.length}`);

    // 获取当前阶段的统计数据
    const stats = stageStats.get(stage) || {
      total: 0,
      success: 0,
      failed: 0,
      running: 0,
      waiting: 0,
    };

    return {
      id: stage,
      name: stage,
      nodes,
      edges,
      // 添加统计数据，符合 FlowStats 接口
      stats: {
        name: stage,
        ...stats,
      },
    };
  });
  // 返回所有分组的DAG数据，符合 FlowState 接口
  return dagData;
}
