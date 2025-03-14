import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Node, Edge } from '@xyflow/react';

export interface FlowStats {
  // 时间阶段
  name: string;
  // 总任务数
  total: number;
  // 成功数
  success: number;
  // 失败数
  failed: number;
  // 运行中
  running: number;
  // 等待中
  waiting: number;
}

export interface FlowStage {
  id: string;
  // 阶段
  name: string;
  // 节点
  nodes: Node[];
  // 边
  edges: Edge[];
  // 统计
  stats: FlowStats;
}

// 在状态接口中添加防抖控制
interface FlowState {
  stages: FlowStage[];
  // 当前阶段
  currentStage: string | null;
  // 日期
  date: Date | null;
  // 项目
  projects: string[];
  isLoading: boolean;
  // 操作方法
  setStages: (stages: FlowStage[]) => void;
  setCurrentStage: (stage: string) => void;
  setLoading: (loading: boolean) => void;
  setProjects: (projects: string[]) => void;
}

export const useFlowStore = create<FlowState>()(
  immer((set) => ({
    stages: [],
    currentStage: null,
    date: new Date(),
    projects: [],
    isLoading: false,

    // 使用immer简化状态更新
    // 修改 setStages 方法
    setStages: (stages) =>
      set((state) => {
        state.stages = stages;
        // 重置当前阶段
        state.currentStage = null;
      }),

    setCurrentStage: (stage) =>
      set((state) => {
        state.currentStage = stage;
      }),

    setLoading: (isLoading) =>
      set((state) => {
        state.isLoading = isLoading;
      }),

    setProjects: (projects) =>
      set((state) => {
        state.projects = projects;
      }),
  }))
);
