import { PlanState } from '@/types/db-types';

// 定义一个复合类型，包含 PlanState 和 time_stage
export type PlanStateWithTimeStage = PlanState & { time_stage: string | null };
