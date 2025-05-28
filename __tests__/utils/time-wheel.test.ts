import { describe, test, beforeEach, afterEach, afterAll, expect, vi } from 'vitest';
import TimeWheel from '@/utils/time-wheel';

describe('TimeWheel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test('应该正确初始化时间轮', () => {
    const timeWheel = new TimeWheel(10, 100);
    expect(timeWheel).toBeDefined();
  });

  test('应该能添加任务并执行', async () => {
    const timeWheel = new TimeWheel(10, 100);
    const mockCallback = vi.fn();

    timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: false,
    });

    // 前进100ms并运行所有timers
    await vi.advanceTimersByTimeAsync(100);

    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  test('应该能处理重复任务', async () => {
    // 创建一个带有停止功能的测试
    const timeWheel = new TimeWheel(10, 100);
    const mockCallback = vi.fn();

    // 修改：直接替换时间轮的addTask方法，避免重复添加任务
    const originalAddTask = timeWheel.addTask.bind(timeWheel);
    let taskCount = 0;

    // 覆盖addTask方法，只允许添加3次任务
    timeWheel.addTask = vi.fn((options, existingId) => {
      if (taskCount < 3) {
        taskCount++;
        return originalAddTask(options, existingId);
      }
      return 'mock-task-id';
    });

    timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
    });

    // 只执行3次循环
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    // 停止时间轮，防止后续执行
    timeWheel.stop();

    // 验证回调只被调用了3次
    expect(mockCallback).toHaveBeenCalledTimes(3);
  });

  // 新增测试：测试指定重复次数的任务
  test('应该在达到指定的最大执行次数后停止重复任务', async () => {
    const timeWheel = new TimeWheel(10, 100);
    const mockCallback = vi.fn();

    // 添加一个最大执行5次的重复任务
    timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
      maxExecutions: 5,
    });

    // 执行6次循环，但任务应该只执行5次
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    // 验证回调只被调用了5次
    expect(mockCallback).toHaveBeenCalledTimes(5);

    // 再执行一次循环，确认任务不会再执行
    await vi.advanceTimersByTimeAsync(100);

    // 验证回调仍然只被调用了5次
    expect(mockCallback).toHaveBeenCalledTimes(5);
  });

  // 新增测试：测试移除任务功能
  test('应该能够手动移除任务', async () => {
    const timeWheel = new TimeWheel(10, 100);
    const mockCallback = vi.fn();

    // 添加一个重复任务
    const taskId = timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
    });

    // 执行一次循环
    await vi.advanceTimersByTimeAsync(100);

    // 验证回调被调用了1次
    expect(mockCallback).toHaveBeenCalledTimes(1);

    // 移除任务
    const removed = timeWheel.removeTask(taskId);
    expect(removed).toBe(true);

    // 再执行两次循环
    await vi.advanceTimersByTimeAsync(200);

    // 验证回调仍然只被调用了1次
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  // 确保所有测试结束后清理资源
  afterAll(() => {
    vi.useRealTimers();
  });
});
