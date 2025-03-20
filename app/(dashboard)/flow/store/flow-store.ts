import { Edge, Node } from '@xyflow/react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface FlowStats {
  name: string;
  total: number;
  success: number;
  failed: number;
  running: number;
  waiting: number;
}

export interface FlowStage {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  stats: FlowStats;
}

interface TaskDetailState {
  isOpen: boolean;
  planId: string;
  planDesc: string | null;
  redateTimestamp: number | null;
  exeId: number;
}

interface FlowState {
  stages: FlowStage[];
  currentStage: string | null;
  dateTimestamp: number | null;
  projects: string[];
  isLoading: boolean;
  taskDetail: TaskDetailState;
  setStages: (stages: FlowStage[]) => void;
  setCurrentStage: (stage: string) => void;
  setLoading: (loading: boolean) => void;
  setProjects: (projects: string[]) => void;
  openTaskDetail: (planId: string, planDesc: string | null, redate: Date, exeId: number) => void;
  closeTaskDetail: () => void;
}

export const useFlowStore = create<FlowState>()(
  immer((set) => ({
    stages: [],
    currentStage: null,
    dateTimestamp: null,
    projects: [],
    isLoading: false,
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
      set((state) => {
        state.taskDetail.isOpen = true;
        state.taskDetail.planId = planId;
        state.taskDetail.planDesc = planDesc;
        state.taskDetail.redateTimestamp = redate ? redate.getTime() : null;
        state.taskDetail.exeId = exeId;
      }),

    closeTaskDetail: () =>
      set((state) => {
        state.taskDetail.isOpen = false;
      }),
  }))
);
