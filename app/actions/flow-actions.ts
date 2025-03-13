'use server';
import { format } from 'date-fns';
import logger from '@/utils/logger';
import mysqlPool from '@/lib/instance/mysql-client';
import { PlanConf, PlanState } from '@/types/db-types';

// 获取所有有效的服务器配置
export async function getAllPlanConf() {
  try {
    // 使用 MySQL 连接池执行查询
    const [rows] = await mysqlPool.query(
      `SELECT plan_id, time_stage, plan_deps, plan_desc
         FROM plan_conf 
         WHERE time_stage IS NOT NULL 
         and status <> 'OFF' 
         and is_his = 'N'
         and upper(is_efct) = 'Y'`
    );
    // 过滤掉无效的时间阶段
    const validRows = (rows as PlanConf[]).filter(
      (row) => row.time_stage !== null && row.time_stage !== '' && row.time_stage !== '-'
    );
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
export async function handleSearch(date: Date | null, selectedOptions: string[] | null) {
  if (!date) return { nodes: [], edges: [] };
  const dateStr = format(date, 'yyyy/MM/dd');
  // 创建 Map: time_stage -> plan_id[]
  const timeStageMap = new Map<string, string[]>();
  const allPlanConfs = await getAllPlanConf();
  // 遍历结果，将 plan_id 按 time_stage 分组
  allPlanConfs.forEach((row) => {
    const timeStage = row.time_stage as string;
    const planId = row.plan_id;
    if (!timeStageMap.has(timeStage)) {
      timeStageMap.set(timeStage, []);
    }
    timeStageMap.get(timeStage)?.push(planId);
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
      ? Array.from(timeStageMap.values()).flat() // 获取所有计划ID
      : selectedOptions.flatMap((option) => timeStageMap.get(option) || []); // 获取选中的计划ID

  // 记录搜索条件
  logger.info(
    `搜索条件: 日期=${dateStr}, ` +
      `时间阶段=${allPlanIds?.length ? allPlanIds.join(', ') : '未选择'}, ` +
      `计划ID数量=${allPlanIds.length}`
  );
  const planStates = await getPlanState(dateStr, allPlanIds);
  //
  // 按 time_stage 分组（需要从 planConfs 中获取对应的 time_stage）
  const groupedByStage = new Map<string, PlanState[]>();
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
  logger.info(`查询到计划状态数据: ${planStates.length}条`);

  // 根据分组数据 计算每一行 总数量 成功数量 失败数量 执行中数量 等待数量 使用PlanState status 字段

  // 根据time_stage groupedByStage 数据
  // 每个分组使用PlanConfs 创建一个Dag 图数组， 判断 plan_deps 为空 则plan_id 为根节点，根据根节点和 plan_deps 生成Dag 图，该图用做边描述
  // 每个分组使用PlanState 数据 生成节点数据， 节点数据使用PlanState 数据， 节点数据使用PlanState status 字段 生成节点颜色
  // 生成DAG图数据
  const dagData = Array.from(groupedByStage).map(([stage, states]) => {
    // 生成节点数据（结合状态信息）
    const nodes = states.map((state) => {
      return {
        id: state.plan_id,
        label: `${state.plan_id}\n${state.plan_desc}`,
        // 需要转化为success error
        status: state?.plan_state?.toLowerCase() || 'unknown',
        data: state,
      };
    });

    // 获取当前阶段的所有计划配置
    const stageConfs = allPlanConfs.filter((conf) => conf.time_stage === stage);
    // 生成边数据（处理依赖关系）
    const edges = stageConfs.reduce((acc: any[], conf) => {
      if (conf.plan_deps) {
        const dependencies = conf.plan_deps
          .split(',')
          .map((dep) => dep.trim())
          .filter((dep) => stageConfs.some((c) => c.plan_id === dep)); // 仅保留本阶段内的依赖

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

    // 记录分组统计（包含状态分布）
    const statusCounts = states.reduce((acc: Record<string, number>, state) => {
      const status = state.plan_state || 'UNKNOWN';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    logger.info(`[${stage}] 状态分布: ${JSON.stringify(statusCounts)}`);
    logger.info(`[${stage}] 节点数: ${nodes.length}, 边数: ${edges.length}`);
    return { stage, nodes, edges };
  });

  // 返回第一个分组的DAG数据（示例）
  return dagData.length > 0 ? dagData[0] : { nodes: [], edges: [] };
}
