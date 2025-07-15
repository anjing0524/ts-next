// 添加任务状态映射
// N 等待
// P 等待
// A 等待
// S 等待

// T 失败
// F 失败
// Z 依赖任务失败

// D 成功
// K 跳过

// R 运行中
// C 取消

export const TASK_STATE_MAP: Record<
  string,
  { label: string; variant: 'default' | 'destructive' | 'success' | 'warning' }
> = {
  // 成功状态
  D: { label: '成功', variant: 'success' },
  K: { label: '跳过', variant: 'success' },

  // 失败状态
  T: { label: '失败', variant: 'destructive' },
  F: { label: '失败', variant: 'destructive' },
  Z: { label: '依赖任务失败', variant: 'destructive' },

  // 运行状态
  R: { label: '运行中', variant: 'warning' },

  // 默认状态
  C: { label: '取消', variant: 'default' },
  N: { label: '等待', variant: 'default' },
  P: { label: '等待', variant: 'default' },
  A: { label: '等待', variant: 'default' },
  S: { label: '等待', variant: 'default' },
};
