import { setImmediate, setTimeout, clearTimeout } from 'node:timers';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

interface Task {
  id: string;
  delay: number;
  callback: () => void;
  repeat: boolean;
}

type TaskOptions = Omit<Task, 'id'>;

class TimeWheel {
  private slots: Map<string, Task>[];
  private currentSlot: number;
  private interval: number;
  private timer: NodeJS.Timeout | null;
  private isRunning: boolean;

  constructor(slotCount: number, interval: number) {
    if (slotCount <= 0 || interval <= 0) {
      throw new Error('slotCount和interval必须大于0');
    }
    this.slots = new Array(slotCount).fill(null).map(() => new Map());
    this.currentSlot = 0;
    this.interval = interval;
    this.timer = null;
    this.isRunning = false;
    logger.info(`TimeWheel 初始化: ${slotCount} 槽位, ${interval}ms 间隔`);
  }

  /**
   * 添加任务
   * @param options 任务选项
   * @param existingId 可选的现有任务ID
   * @returns 任务ID
   */
  addTask(options: TaskOptions, existingId?: string): string {
    const id = existingId || uuidv4();
    const task: Task = { ...options, id };

    const slotIndex = this.calculateSlotIndex(options.delay);
    this.slots[slotIndex].set(id, task);
    logger.debug(
      `添加任务: ${id}, 延迟: ${options.delay}ms, 槽位: ${slotIndex}, 重复: ${options.repeat}`
    );
    this.ensureRunning();
    return id;
  }

  /**
   * 计算任务应该放入的槽位索引
   */
  private calculateSlotIndex(delay: number): number {
    return (this.currentSlot + Math.floor(delay / this.interval)) % this.slots.length;
  }

  /**
   * 确保时间轮正在运行
   */
  private ensureRunning(): void {
    if (!this.isRunning) {
      logger.info('时间轮未运行，启动时间轮');
      this.start();
    }
  }

  /**
   * 开始转动时间轮
   */
  start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      logger.info('时间轮开始运行');
      this.tick();
    }
  }

  /**
   * 停止转动时间轮
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('时间轮停止运行');
  }

  /**
   * 检查是否还有剩余任务
   */
  private hasRemainingTasks(): boolean {
    return this.slots.some((slot) => slot.size > 0);
  }

  /**
   * 时间轮转动
   */
  private tick(): void {
    logger.debug(`时间轮转动: 当前槽位 ${this.currentSlot}`);
    const currentTasks = this.slots[this.currentSlot];
    const taskCount = currentTasks.size;
    if (taskCount > 0) {
      logger.debug(`执行槽位 ${this.currentSlot} 的 ${taskCount} 个任务`);
      this.executeTasks(currentTasks);
    }
    // 清空当前槽位的任务
    currentTasks.clear();
    // 进入下一个槽位
    this.currentSlot = (this.currentSlot + 1) % this.slots.length;
    this.scheduleNextTick();
  }

  /**
   * 执行当前槽位的所有任务
   */
  private executeTasks(tasks: Map<string, Task>): void {
    for (const task of tasks.values()) {
      try {
        logger.debug(`执行任务: ${task.id}`);
        task.callback();
        if (task.repeat) {
          logger.debug(`重复任务: ${task.id}, 延迟: ${task.delay}ms`);
          // 使用相同的ID重新添加任务
          this.addTask(
            {
              delay: task.delay,
              callback: task.callback,
              repeat: true,
            },
            task.id
          );
        }
      } catch (error) {
        logger.error(
          `执行任务 ${task.id} 时发生错误: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * 安排下一次时间轮转动
   */
  private scheduleNextTick(): void {
    if (this.hasRemainingTasks()) {
      this.timer = setTimeout(() => {
        setImmediate(() => this.tick());
      }, this.interval);
    } else {
      logger.info('没有剩余任务，停止时间轮');
      this.stop();
    }
  }
}

export default TimeWheel;
