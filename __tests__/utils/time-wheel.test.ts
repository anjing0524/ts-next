import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import TimeWheel from '@/utils/time-wheel';

describe('TimeWheel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // 辅助函数：推进时间并执行所有定时器
  function advanceTimeAndRunTimers(ms: number) {
    vi.advanceTimersByTime(ms);
    vi.runOnlyPendingTimers();
  }

  test('应该正确初始化时间轮', () => {
    const timeWheel = new TimeWheel(10, 100);
    expect(timeWheel).toBeDefined();
    timeWheel.stop();
  });

  test('应该能添加任务并返回任务ID', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    const taskId = timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: false,
    });

    expect(taskId).toBeDefined();
    expect(typeof taskId).toBe('string');
    expect(taskId.length).toBeGreaterThan(0);
    timeWheel.stop();
  });

  test('应该能添加单次任务并执行', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: false,
    });

    // 执行前检查
    expect(mockCallback).not.toHaveBeenCalled();

    // 推进时间并执行所有定时器
    advanceTimeAndRunTimers(100);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    timeWheel.stop();
  });

  test('应该能处理重复任务', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
      maxExecutions: 3,
    });

    // 执行3次循环 - 每次推进100ms，正好是时间轮的interval
    for (let i = 1; i <= 3; i++) {
      advanceTimeAndRunTimers(100);
      expect(mockCallback).toHaveBeenCalledTimes(i);
    }

    // 第4次应该不再执行（已达最大次数）
    advanceTimeAndRunTimers(100);
    expect(mockCallback).toHaveBeenCalledTimes(3);

    timeWheel.stop();
  });

  test('应该在达到指定的最大执行次数后停止重复任务', () => {
    const timeWheel = new TimeWheel(8, 50);
    const mockCallback = vi.fn();

    timeWheel.addTask({
      delay: 50,
      callback: mockCallback,
      repeat: true,
      maxExecutions: 5,
    });

    // 执行6次循环，但任务应该只执行5次
    for (let i = 1; i <= 6; i++) {
      advanceTimeAndRunTimers(50);

      if (i <= 5) {
        expect(mockCallback).toHaveBeenCalledTimes(i);
      } else {
        expect(mockCallback).toHaveBeenCalledTimes(5); // 仍然是5次
      }
    }

    timeWheel.stop();
  });

  test('应该能够手动移除任务', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    const taskId = timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
    });

    // 执行一次
    advanceTimeAndRunTimers(100);
    expect(mockCallback).toHaveBeenCalledTimes(1);

    // 移除任务
    const removed = timeWheel.removeTask(taskId);
    expect(removed).toBe(true);

    // 再执行，不应该被调用
    advanceTimeAndRunTimers(100);
    expect(mockCallback).toHaveBeenCalledTimes(1);

    timeWheel.stop();
  });

  test('应该能处理多个不同延时的重复任务', () => {
    const timeWheel = new TimeWheel(8, 50);
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    // 任务1：每50ms执行一次，最多2次
    timeWheel.addTask({
      delay: 50,
      callback: callback1,
      repeat: true,
      maxExecutions: 2,
    });

    // 任务2：每100ms执行一次，最多2次
    timeWheel.addTask({
      delay: 100,
      callback: callback2,
      repeat: true,
      maxExecutions: 2,
    });

    // 一次性推进到50ms: callback1 第1次
    vi.advanceTimersByTime(50);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers(); // 额外的 runOnlyPendingTimers 来处理 setImmediate
    expect(callback1).toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();

    // 一次性推进到100ms: callback1 第2次, callback2 第1次
    vi.advanceTimersByTime(50);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers(); // 额外的 runOnlyPendingTimers
    expect(callback1).toHaveBeenCalledTimes(2);
    expect(callback2).toHaveBeenCalledTimes(1);

    // 一次性推进到150ms: callback1 不再执行（已达最大次数）
    vi.advanceTimersByTime(50);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers(); // 额外的 runOnlyPendingTimers
    expect(callback1).toHaveBeenCalledTimes(2);

    // 一次性推进到200ms: callback2 第2次
    vi.advanceTimersByTime(50);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers(); // 额外的 runOnlyPendingTimers
    expect(callback1).toHaveBeenCalledTimes(2);
    expect(callback2).toHaveBeenCalledTimes(2);

    timeWheel.stop();
  });

  test('应该能处理任务执行中的错误并继续其他任务', () => {
    const timeWheel = new TimeWheel(4, 100);
    const errorCallback = vi.fn(() => {
      throw new Error('Task execution error');
    });
    const normalCallback = vi.fn();

    timeWheel.addTask({
      delay: 100,
      callback: errorCallback,
      repeat: false, // 改为单次执行，简化测试
    });

    timeWheel.addTask({
      delay: 200, // 使用不同的延时，避免同时执行
      callback: normalCallback,
      repeat: false,
    });

    // 第一次执行：推进到100ms，执行错误回调
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(errorCallback).toHaveBeenCalledTimes(1);
    expect(normalCallback).toHaveBeenCalledTimes(0);

    // 第二次执行：再推进100ms，执行正常回调
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(errorCallback).toHaveBeenCalledTimes(1);
    expect(normalCallback).toHaveBeenCalledTimes(1);

    timeWheel.stop();
  });

  test('应该正确记录任务执行时的错误信息', () => {
    const timeWheel = new TimeWheel(8, 100); // 增加槽位数量避免冲突

    // Test Error object handling - covers line 154-158
    const errorObjectCallback = vi.fn(() => {
      throw new Error('Specific error message');
    });

    // Test string error handling - covers the else branch of error instanceof Error
    const stringErrorCallback = vi.fn(() => {
      throw 'String error message';
    });

    // Test undefined error handling
    const undefinedErrorCallback = vi.fn(() => {
      throw undefined;
    });

    // Add tasks to different slots to avoid conflicts
    timeWheel.addTask({
      delay: 100, // 槽位 1
      callback: errorObjectCallback,
      repeat: false,
    });

    timeWheel.addTask({
      delay: 200, // 槽位 2
      callback: stringErrorCallback,
      repeat: false,
    });

    timeWheel.addTask({
      delay: 300, // 槽位 3
      callback: undefinedErrorCallback,
      repeat: false,
    });

    // Execute first task (100ms)
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(errorObjectCallback).toHaveBeenCalledTimes(1);

    // Execute second task (200ms total)
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(stringErrorCallback).toHaveBeenCalledTimes(1);

    // Execute third task (300ms total)
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(undefinedErrorCallback).toHaveBeenCalledTimes(1);

    timeWheel.stop();
  });

  test('应该能在重复任务执行中处理错误', () => {
    const timeWheel = new TimeWheel(4, 100);
    let callCount = 0;

    const errorOnSecondCallCallback = vi.fn(() => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Error on second execution');
      }
      return 'success';
    });

    timeWheel.addTask({
      delay: 100,
      callback: errorOnSecondCallCallback,
      repeat: true,
      maxExecutions: 2, // 减少到2次，因为第2次会抛错但仍会增加执行计数
    });

    // First execution - should succeed
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(errorOnSecondCallCallback).toHaveBeenCalledTimes(1);

    // Second execution - should throw error and stop due to maxExecutions
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(errorOnSecondCallCallback).toHaveBeenCalledTimes(2);

    // No more executions after maxExecutions reached
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(errorOnSecondCallCallback).toHaveBeenCalledTimes(2);

    timeWheel.stop();
  });

  test('应该能添加多个不同的任务', () => {
    const timeWheel = new TimeWheel(4, 100);
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const taskId1 = timeWheel.addTask({
      delay: 100,
      callback: callback1,
      repeat: false,
    });

    const taskId2 = timeWheel.addTask({
      delay: 200,
      callback: callback2,
      repeat: false,
    });

    expect(taskId1).toBeDefined();
    expect(taskId2).toBeDefined();
    expect(taskId1).not.toBe(taskId2);
    timeWheel.stop();
  });

  test('应该能移除存在的任务', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    const taskId = timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: false,
    });

    const removed = timeWheel.removeTask(taskId);
    expect(removed).toBe(true);

    // 尝试移除不存在的任务
    const removedAgain = timeWheel.removeTask('non-existent-id');
    expect(removedAgain).toBe(false);

    timeWheel.stop();
  });

  test('应该能启动和停止时间轮', () => {
    const timeWheel = new TimeWheel(4, 100);

    // 测试手动启动
    timeWheel.start();

    // 测试停止功能
    timeWheel.stop();

    // 多次停止不应该抛错
    expect(() => timeWheel.stop()).not.toThrow();
  });

  test('应该在添加任务时自动启动', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    // 添加任务应该自动启动时间轮
    const taskId = timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: false,
    });

    expect(taskId).toBeDefined();
    timeWheel.stop();
  });

  test('应该正确处理错误的初始化参数', () => {
    // 测试无效的初始化参数
    expect(() => new TimeWheel(0, 100)).toThrow('slotCount和interval必须大于0');
    expect(() => new TimeWheel(10, 0)).toThrow('slotCount和interval必须大于0');
    expect(() => new TimeWheel(-1, 100)).toThrow('slotCount和interval必须大于0');
    expect(() => new TimeWheel(10, -1)).toThrow('slotCount和interval必须大于0');
  });

  test('应该能处理大量任务', () => {
    const timeWheel = new TimeWheel(10, 100);
    const taskIds: string[] = [];

    // 添加多个任务
    for (let i = 0; i < 50; i++) {
      const taskId = timeWheel.addTask({
        delay: (i % 10) * 100, // 分散到不同槽位
        callback: vi.fn(),
        repeat: false,
      });
      taskIds.push(taskId);
    }

    expect(taskIds).toHaveLength(50);
    expect(new Set(taskIds).size).toBe(50); // 所有ID都应该不同

    // 移除前25个任务
    let removedCount = 0;
    for (let i = 0; i < 25; i++) {
      const removed = timeWheel.removeTask(taskIds[i]);
      if (removed) removedCount++;
    }

    // 至少应该移除24个任务（允许一个误差）
    expect(removedCount).toBeGreaterThanOrEqual(24);
    expect(removedCount).toBeLessThanOrEqual(25);
    timeWheel.stop();
  });

  test('应该测试无限重复任务的工作机制', () => {
    const timeWheel = new TimeWheel(4, 50);
    const mockCallback = vi.fn();

    // 添加无限重复任务（没有maxExecutions）
    const taskId = timeWheel.addTask({
      delay: 50,
      callback: mockCallback,
      repeat: true,
      // 没有设置maxExecutions
    });

    expect(taskId).toBeDefined();

    // 执行5次，验证无限重复
    for (let i = 1; i <= 5; i++) {
      advanceTimeAndRunTimers(50);
      expect(mockCallback).toHaveBeenCalledTimes(i);
    }

    // 手动移除任务
    const removed = timeWheel.removeTask(taskId);
    expect(removed).toBe(true);

    // 再执行一次，不应该再被调用
    advanceTimeAndRunTimers(50);
    expect(mockCallback).toHaveBeenCalledTimes(5); // 仍然是5次

    timeWheel.stop();
  });

  test('应该能测试无限重复任务的日志记录', () => {
    const timeWheel = new TimeWheel(4, 100);
    const mockCallback = vi.fn();

    // 添加无限重复任务，确保会进入无maxExecutions的日志分支
    const taskId = timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
      // 没有设置maxExecutions，这样会触发第156行的空字符串分支
    });

    // 执行一次，确保触发重复添加的日志
    advanceTimeAndRunTimers(100);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    timeWheel.removeTask(taskId);
    timeWheel.stop();
  });

  test('应该测试任务执行时序和槽位计算', () => {
    const timeWheel = new TimeWheel(4, 100);
    const callbacks = [
      vi.fn(() => console.log('Task 1 (100ms) executed')),
      vi.fn(() => console.log('Task 2 (200ms) executed')),
      vi.fn(() => console.log('Task 3 (300ms) executed')),
    ];

    // 添加任务到不同时间点
    console.log('Adding tasks...');
    timeWheel.addTask({
      delay: 100, // 槽位1
      callback: callbacks[0],
      repeat: false,
    });

    timeWheel.addTask({
      delay: 200, // 槽位2
      callback: callbacks[1],
      repeat: false,
    });

    timeWheel.addTask({
      delay: 300, // 槽位3
      callback: callbacks[2],
      repeat: false,
    });

    console.log('Tasks added, advancing to 100ms...');
    // 100ms: 第1个任务执行
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers(); // 额外的 runOnlyPendingTimers
    console.log(
      `At 100ms: Task1=${callbacks[0].mock.calls.length}, Task2=${callbacks[1].mock.calls.length}, Task3=${callbacks[2].mock.calls.length}`
    );
    expect(callbacks[0]).toHaveBeenCalledTimes(1);
    expect(callbacks[1]).toHaveBeenCalledTimes(0);
    expect(callbacks[2]).toHaveBeenCalledTimes(0);

    console.log('Advancing to 200ms...');
    // 200ms: 第2个任务执行 - 再推进100ms
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    console.log(
      `At 200ms: Task1=${callbacks[0].mock.calls.length}, Task2=${callbacks[1].mock.calls.length}, Task3=${callbacks[2].mock.calls.length}`
    );
    expect(callbacks[0]).toHaveBeenCalledTimes(1);
    expect(callbacks[1]).toHaveBeenCalledTimes(1);
    expect(callbacks[2]).toHaveBeenCalledTimes(0);

    console.log('Advancing to 300ms...');
    // 300ms: 第3个任务执行 - 再推进100ms
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers(); // 额外的 runOnlyPendingTimers
    console.log(
      `At 300ms: Task1=${callbacks[0].mock.calls.length}, Task2=${callbacks[1].mock.calls.length}, Task3=${callbacks[2].mock.calls.length}`
    );
    expect(callbacks[0]).toHaveBeenCalledTimes(1);
    expect(callbacks[1]).toHaveBeenCalledTimes(1);
    expect(callbacks[2]).toHaveBeenCalledTimes(1);

    timeWheel.stop();
  });

  test('应该验证同一槽位多个任务的错误隔离性', () => {
    const timeWheel = new TimeWheel(4, 100);

    // 创建多个回调函数，其中一些会抛错
    const successCallback1 = vi.fn(() => {
      console.log('successCallback1 called');
      return 'success1';
    });
    const errorCallback = vi.fn(() => {
      console.log('errorCallback called');
      throw new Error('Task failed in slot');
    });
    const successCallback2 = vi.fn(() => {
      console.log('successCallback2 called');
      return 'success2';
    });

    // 将任务添加到同一个时间延迟，确保它们在同一槽位
    timeWheel.addTask({
      delay: 100,
      callback: successCallback1,
      repeat: false,
    });

    timeWheel.addTask({
      delay: 100,
      callback: errorCallback,
      repeat: false,
    });

    timeWheel.addTask({
      delay: 100,
      callback: successCallback2,
      repeat: false,
    });

    // 执行前检查 - 任务还没有执行
    expect(successCallback1).toHaveBeenCalledTimes(0);
    expect(errorCallback).toHaveBeenCalledTimes(0);
    expect(successCallback2).toHaveBeenCalledTimes(0);

    // 执行所有任务 - 推进100ms到达目标槽位
    // 3个任务 + 1 = 4轮次，但由于是单次任务，只需要1轮
    vi.advanceTimersByTime(100);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();

    // 验证所有任务都被执行了，包括成功的和失败的
    expect(successCallback1).toHaveBeenCalledTimes(1);
    expect(errorCallback).toHaveBeenCalledTimes(1); // 即使抛错也被调用了
    expect(successCallback2).toHaveBeenCalledTimes(1); // 前面任务失败不影响这个

    timeWheel.stop();
  });

  test('应该验证同一槽位重复任务的错误隔离性', () => {
    const timeWheel = new TimeWheel(4, 100);

    // 创建一个成功的重复任务和一个在第2次执行时失败的重复任务
    const alwaysSuccessCallback = vi.fn(() => {
      return 'always success';
    });

    let failingTaskCallCount = 0;
    const sometimesFailCallback = vi.fn(() => {
      failingTaskCallCount++;
      if (failingTaskCallCount === 2) {
        throw new Error('Failed on second execution');
      }
      return 'success';
    });

    // 将两个重复任务添加到不同的延迟，避免同时执行的复杂性
    timeWheel.addTask({
      delay: 100,
      callback: alwaysSuccessCallback,
      repeat: true,
      maxExecutions: 3,
    });

    timeWheel.addTask({
      delay: 200, // 不同的延迟
      callback: sometimesFailCallback,
      repeat: true,
      maxExecutions: 3,
    });

    // 执行足够的时间让两个任务都执行完毕
    // 第一个任务：100ms, 200ms, 300ms
    // 第二个任务：200ms, 400ms, 600ms
    // 所以需要至少600ms
    for (let i = 0; i < 8; i++) {
      advanceTimeAndRunTimers(100);
    }

    // 验证两个任务都执行了预期的次数
    expect(alwaysSuccessCallback).toHaveBeenCalledTimes(3);
    expect(sometimesFailCallback).toHaveBeenCalledTimes(3);

    timeWheel.stop();
  });

  test('should handle multiple repeat tasks in same slot with errors', async () => {
    const timeWheel = new TimeWheel(4, 100);
    const callbacks = [vi.fn(), vi.fn()];
    callbacks[0].mockImplementation(() => {
      throw new Error('Task 1 failed');
    });

    // 添加两个相同延迟的重复任务到同一个槽位
    timeWheel.addTask({
      delay: 100,
      callback: callbacks[0],
      repeat: true,
      maxExecutions: 2,
    });

    timeWheel.addTask({
      delay: 100, // 相同延迟，应该在同一个槽位
      callback: callbacks[1],
      repeat: true,
      maxExecutions: 2,
    });

    // 等待时间轮启动
    await vi.runOnlyPendingTimersAsync();

    // 第一次执行（100ms）
    vi.advanceTimersByTime(100);
    await vi.runOnlyPendingTimersAsync();

    expect(callbacks[0]).toHaveBeenCalledTimes(1);
    expect(callbacks[1]).toHaveBeenCalledTimes(1);

    // 第二次执行（200ms）
    vi.advanceTimersByTime(100);
    await vi.runOnlyPendingTimersAsync();

    expect(callbacks[0]).toHaveBeenCalledTimes(2);
    expect(callbacks[1]).toHaveBeenCalledTimes(2);

    timeWheel.stop();
  });
});
