import { PlanState, TaskConf, TaskState } from '@/types/db-types';

export type PlanStateWithStatus = PlanState & {
  status: string;
};

export type TaskConfState = TaskConf &
  TaskState & {
    startTimeFormatted: string | null;
    endTimeFormatted: string | null;
    redateFormatted: string | null;
  };

// 使用 Pick 从 TaskConfState 中选择需要的字段
export type TaskStateDetailType = Pick<
  TaskConfState,
  | 'id'
  | 'redate'
  | 'task_pk'
  | 'task_id'
  | 'plan_id'
  | 'exec_cmd'
  | 'exe_id'
  | 'task_state'
  | 'cost_time'
  | 'exec_desc'
  | 'ret_value'
  | 'startTimeFormatted'
  | 'endTimeFormatted'
  | 'redateFormatted'
>;
