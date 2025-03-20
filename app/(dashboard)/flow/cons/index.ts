// 添加任务状态映射
export const TASK_STATE_MAP: Record<
  string,
  { label: string; variant: 'default' | 'destructive' | 'success' | 'warning' }
> = {
  // 成功状态
  D: { label: '完成', variant: 'success' },
  K: { label: '跳过', variant: 'success' },

  // 失败状态
  F: { label: '失败', variant: 'destructive' },
  Z: { label: '终止', variant: 'destructive' },
  C: { label: '取消', variant: 'destructive' },
  T: { label: '超时', variant: 'destructive' },

  // 运行状态
  R: { label: '运行中', variant: 'warning' },
  W: { label: '等待', variant: 'warning' },

  // 默认状态
  N: { label: '未运行', variant: 'default' },
  P: { label: '准备', variant: 'default' },
};
