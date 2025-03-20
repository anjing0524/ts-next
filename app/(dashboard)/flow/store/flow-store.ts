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

// 添加任务详情对话框状态 - 使用时间戳替代Date
interface TaskDetailState {
  isOpen: boolean;
  planId: string;
  planDesc: string | null;
  // 使用时间戳替代Date对象
  // 避免使用Date对象 容易触发死循环的问题 可使用number 或者字符串存储数据
  redateTimestamp: number | null;
  exeId: number;
}

// 在状态接口中添加防抖控制
interface FlowState {
  stages: FlowStage[];
  // 当前阶段
  currentStage: string | null;
  // 使用时间戳替代Date对象
  dateTimestamp: number | null;
  // 项目
  projects: string[];
  isLoading: boolean;
  // 任务详情对话框状态
  taskDetail: TaskDetailState;
  // 操作方法
  setStages: (stages: FlowStage[]) => void;
  setCurrentStage: (stage: string) => void;
  setLoading: (loading: boolean) => void;
  setProjects: (projects: string[]) => void;
  // 任务详情对话框操作 - 接收Date但存储时间戳
  openTaskDetail: (planId: string, planDesc: string | null, redate: Date, exeId: number) => void;
  closeTaskDetail: () => void;
}

// 使用immer简化状态更新
export const useFlowStore = create<FlowState>()(
  immer((set, get) => ({
    stages: [],
    currentStage: null,
    dateTimestamp: null,
    projects: [],
    isLoading: false,
    // 初始化任务详情对话框状态
    taskDetail: {
      isOpen: false,
      planId: '',
      planDesc: '',
      redateTimestamp: null,
      exeId: 0,
    },
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

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    setProjects: (projects) =>
      set((state) => {
        state.projects = projects;
      }),

    openTaskDetail: (planId, planDesc, redate, exeId) =>
      // 打开任务详情对话框 - 存储时间戳
      set((state) => {
        state.taskDetail.isOpen = true;
        state.taskDetail.planId = planId;
        state.taskDetail.planDesc = planDesc;
        state.taskDetail.redateTimestamp = redate ? redate.getTime() : null;
        state.taskDetail.exeId = exeId;
      }),

    closeTaskDetail: () =>
      // 关闭任务详情对话框
      set((state) => {
        state.taskDetail.isOpen = false;
      }),
  }))
);
