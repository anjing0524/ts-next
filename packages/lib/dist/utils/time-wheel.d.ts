interface Task {
    id: string;
    delay: number;
    callback: () => void;
    repeat: boolean;
    maxExecutions?: number;
    executionCount: number;
}
type TaskOptions = Omit<Task, 'id' | 'executionCount'>;
/**
 * 时间轮工具
 * Time wheel utilities
 */
declare class TimeWheel {
    private slots;
    private currentSlot;
    private interval;
    private timer;
    private isRunning;
    constructor(slotCount: number, interval: number);
    /**
     * 添加任务
     * @param options 任务选项
     * @param existingId 可选的现有任务ID
     * @param executionCount 已执行次数（用于重复任务）
     * @returns 任务ID
     */
    addTask(options: TaskOptions, existingId?: string, executionCount?: number): string;
    /**
     * 计算任务应该放入的槽位索引
     */
    private calculateSlotIndex;
    /**
     * 确保时间轮正在运行
     */
    private ensureRunning;
    /**
     * 开始转动时间轮
     */
    start(): void;
    /**
     * 停止转动时间轮
     */
    stop(): void;
    /**
     * 检查是否还有剩余任务
     */
    private hasRemainingTasks;
    /**
     * 时间轮转动
     */
    private tick;
    /**
     * 执行当前槽位的所有任务
     */
    private executeTasks;
    /**
     * 安排下一次时间轮转动
     */
    private scheduleNextTick;
    /**
     * 移除任务
     * @param taskId 任务ID
     * @returns 是否成功移除
     */
    removeTask(taskId: string): boolean;
}
/**
 * 获取时间轮实例
 * Get time wheel instance
 */
declare function getTimeWheelInstance(): TimeWheel;

export { TimeWheel as default, getTimeWheelInstance };
