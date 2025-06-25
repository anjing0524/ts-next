"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimeWheelInstance = getTimeWheelInstance;
// import { setImmediate, setTimeout, clearTimeout } from 'node:timers';
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("./logger"));
/**
 * 时间轮工具
 * Time wheel utilities
 */
class TimeWheel {
    constructor(slotCount, interval) {
        if (slotCount <= 0 || interval <= 0) {
            throw new Error('slotCount和interval必须大于0');
        }
        this.slots = new Array(slotCount).fill(null).map(() => new Map());
        this.currentSlot = 0;
        this.interval = interval;
        this.timer = null;
        this.isRunning = false;
        logger_1.default.info(`TimeWheel 初始化: ${slotCount} 槽位, ${interval}ms 间隔`);
    }
    /**
     * 添加任务
     * @param options 任务选项
     * @param existingId 可选的现有任务ID
     * @param executionCount 已执行次数（用于重复任务）
     * @returns 任务ID
     */
    addTask(options, existingId, executionCount = 0) {
        const id = existingId || (0, uuid_1.v4)();
        const task = Object.assign(Object.assign({}, options), { id, executionCount });
        const slotIndex = this.calculateSlotIndex(options.delay);
        this.slots[slotIndex].set(id, task);
        const maxExecutionsInfo = options.maxExecutions
            ? `, 最大执行次数: ${options.maxExecutions}, 当前执行次数: ${executionCount}`
            : '';
        logger_1.default.debug(`添加任务: ${id}, 延迟: ${options.delay}ms, 槽位: ${slotIndex}, 重复: ${options.repeat}${maxExecutionsInfo}`);
        // 延迟启动时间轮，避免影响槽位计算
        // 使用setImmediate确保所有同步的addTask调用完成后再启动
        if (!this.isRunning) {
            setImmediate(() => {
                this.ensureRunning();
            });
        }
        return id;
    }
    /**
     * 计算任务应该放入的槽位索引
     */
    calculateSlotIndex(delay) {
        return (this.currentSlot + Math.floor(delay / this.interval)) % this.slots.length;
    }
    /**
     * 确保时间轮正在运行
     */
    ensureRunning() {
        if (!this.isRunning) {
            logger_1.default.info('时间轮未运行，启动时间轮');
            this.start();
        }
    }
    /**
     * 开始转动时间轮
     */
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            logger_1.default.info('时间轮开始运行');
            this.tick();
        }
    }
    /**
     * 停止转动时间轮
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        logger_1.default.info('时间轮停止运行');
    }
    /**
     * 检查是否还有剩余任务
     */
    hasRemainingTasks() {
        return this.slots.some((slot) => slot.size > 0);
    }
    /**
     * 时间轮转动
     */
    tick() {
        logger_1.default.debug(`时间轮转动: 当前槽位 ${this.currentSlot}`);
        const currentTasks = this.slots[this.currentSlot];
        const taskCount = currentTasks.size;
        if (taskCount > 0) {
            logger_1.default.debug(`执行槽位 ${this.currentSlot} 的 ${taskCount} 个任务`);
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
    executeTasks(tasks) {
        // 先收集所有任务到数组，避免在迭代过程中修改Map
        const tasksToExecute = Array.from(tasks.values());
        for (const task of tasksToExecute) {
            // 增加执行次数计数，无论任务是否成功执行
            const newExecutionCount = task.executionCount + 1;
            try {
                logger_1.default.debug(`执行任务: ${task.id}, 执行次数: ${newExecutionCount}`);
                task.callback();
            }
            catch (error) {
                logger_1.default.error(`执行任务 ${task.id} 时发生错误: ${error instanceof Error ? error.message : error}`);
            }
            // 处理重复任务的重新添加，无论任务是否成功执行
            if (task.repeat) {
                if (!task.maxExecutions || newExecutionCount < task.maxExecutions) {
                    logger_1.default.debug(`重复任务: ${task.id}, 延迟: ${task.delay}ms, 执行次数: ${newExecutionCount}${task.maxExecutions ? `/${task.maxExecutions}` : ''}`);
                    // 使用相同的ID重新添加任务，并传递更新后的执行次数
                    this.addTask({
                        delay: task.delay,
                        callback: task.callback,
                        repeat: true,
                        maxExecutions: task.maxExecutions,
                    }, task.id, newExecutionCount);
                }
                else if (task.maxExecutions && newExecutionCount >= task.maxExecutions) {
                    logger_1.default.info(`任务 ${task.id} 已达到最大执行次数 ${task.maxExecutions}，停止重复执行`);
                }
            }
        }
    }
    /**
     * 安排下一次时间轮转动
     */
    scheduleNextTick() {
        if (this.hasRemainingTasks()) {
            this.timer = setTimeout(() => {
                setImmediate(() => this.tick());
            }, this.interval);
        }
        else {
            logger_1.default.info('没有剩余任务，停止时间轮');
            this.stop();
        }
    }
    /**
     * 移除任务
     * @param taskId 任务ID
     * @returns 是否成功移除
     */
    removeTask(taskId) {
        let removed = false;
        for (const slot of this.slots) {
            if (slot.has(taskId)) {
                slot.delete(taskId);
                removed = true;
                logger_1.default.debug(`移除任务: ${taskId}`);
                break;
            }
        }
        // 如果没有剩余任务，停止时间轮
        if (removed && !this.hasRemainingTasks()) {
            logger_1.default.info('移除任务后没有剩余任务，停止时间轮');
            this.stop();
        }
        return removed;
    }
}
let timeWheelInstance = null;
/**
 * 获取时间轮实例
 * Get time wheel instance
 */
function getTimeWheelInstance() {
    if (!timeWheelInstance) {
        timeWheelInstance = new TimeWheel(10, 1000);
    }
    return timeWheelInstance;
}
exports.default = TimeWheel;
