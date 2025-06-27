// 自动生成的数据库表结构类型定义
// 生成时间: 2025-03-13T08:32:23.016Z

export interface PlanConf {
  id: number;
  group_id: number | null; // 组号
  plan_id: string; // 计划id
  plan_desc: string | null; // 计划描述
  time_stage: string | null; // 时间阶段
  project: string | null; // 项目
  plan_deps: string | null; // 前置依赖计划
  date_type: number | null; // 调度日期类型
  cron_str: string; // cron表达式
  is_block_skip: string; // 是否跳过阻塞
  is_paused_skip: string; // 是否跳过非交易日
  is_efct: string; // 是否生效
  is_his: string; // 是否历史: Y-历史 N-正常
  status: string; // 状态
  create_time: Date; // 创建时间
  update_time: Date; // 修改时间
  create_user: string | null; // 创建人
  update_user: string | null; // 最新修改人
  update_proj_ver: string; // 更新版本号
  lock_ver: number; // 乐观锁
}

export interface PlanState {
  id: number;
  redate: Date | null; // 调度日期
  plan_id: string | null; // 计划id
  plan_desc: string | null; // 计划描述
  exe_id: number | null; // 执行轮次
  params: string | null; // 参数
  exec_mode: number | null; // 执行模式
  plan_state: string | null; // 计划状态
  start_time: Date | null; // 开始时间
  end_time: Date | null; // 结束时间
  cost_time: number | null; // 耗时
  total_task: number | null; // 总任务数
  finish_task: number | null; // 已完成任务数
  progress: number | null; // 执行进度
  exec_desc: string | null; // 执行信息
  pid: string | null; // 进程id
}

export interface TaskConf {
  id: number;
  group_id: number | null; // 组号
  task_pk: string; // 任务主键
  task_id: string | null; // 任务id
  task_desc: string | null; // 任务描述
  plan_id: string | null; // 计划id
  task_deps: string | null; // 前置依赖任务
  task_type: number; // 任务类型
  exec_cmd: string; // 执行命令
  tgt_db: string | null; // 目标数据库
  pory: number | null; // 优先级
  is_retry: string | null; // 是否重试
  is_his: string; // 是否历史: Y-历史 N-正常
  status: string; // 状态
  create_time: Date; // 创建时间
  update_time: Date; // 修改时间
  create_user: string; // 创建人
  update_user: string | null; // 最新修改人
  update_proj_ver: string; // 更新版本号
  lock_ver: number; // 乐观锁
}

export interface TaskState {
  id: number;
  redate: Date | null; // 调度日期
  task_pk: string; // 任务主键
  task_id: string | null; // 任务id
  plan_id: string | null; // 计划id
  exec_cmd: string | null; // 执行命令
  exe_id: number | null; // 执行轮次
  task_state: string | null; // 任务状态
  start_time: Date | null; // 开始时间
  end_time: Date | null; // 结束时间
  cost_time: number | null; // 耗时
  exec_desc: string | null; // 执行信息
  ret_value: string | null; // 返回值
}
