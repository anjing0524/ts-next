/**
 * FPS监控器 - 使用requestAnimationFrame精确测量帧率
 * 在主线程中运行，提供准确的FPS测量
 */
export class FPSMonitor {
  private frameCount = 0;
  private lastTime = 0;
  private currentFPS = 0;
  private isRunning = false;
  private animationId: number | null = null;
  private fpsHistory: number[] = [];
  private readonly historySize = 60; // 保留60帧的历史记录
  
  /**
   * 开始FPS监控
   */
  start(): void {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.measureFPS();
  }
  
  /**
   * 停止FPS监控
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  /**
   * 获取当前FPS
   */
  getCurrentFPS(): number {
    return this.currentFPS;
  }
  
  /**
   * 获取平均FPS（基于历史记录）
   */
  getAverageFPS(): number {
    if (this.fpsHistory.length === 0) {
      return 0;
    }
    
    const sum = this.fpsHistory.reduce((acc, fps) => acc + fps, 0);
    return sum / this.fpsHistory.length;
  }
  
  /**
   * 获取最小FPS
   */
  getMinFPS(): number {
    return this.fpsHistory.length > 0 ? Math.min(...this.fpsHistory) : 0;
  }
  
  /**
   * 获取最大FPS
   */
  getMaxFPS(): number {
    return this.fpsHistory.length > 0 ? Math.max(...this.fpsHistory) : 0;
  }
  
  /**
   * 重置统计数据
   */
  reset(): void {
    this.frameCount = 0;
    this.currentFPS = 0;
    this.fpsHistory = [];
    this.lastTime = performance.now();
  }
  
  /**
   * 获取详细的FPS统计信息
   */
  getStats() {
    return {
      current: this.getCurrentFPS(),
      average: this.getAverageFPS(),
      min: this.getMinFPS(),
      max: this.getMaxFPS(),
      isRunning: this.isRunning,
      sampleCount: this.fpsHistory.length
    };
  }
  
  /**
   * 核心FPS测量循环
   */
  private measureFPS = (): void => {
    if (!this.isRunning) {
      return;
    }
    
    const currentTime = performance.now();
    this.frameCount++;
    
    // 每秒计算一次FPS
    const deltaTime = currentTime - this.lastTime;
    if (deltaTime >= 1000) {
      // 计算FPS
      this.currentFPS = Math.round((this.frameCount * 1000) / deltaTime);
      
      // 添加到历史记录
      this.fpsHistory.push(this.currentFPS);
      
      // 限制历史记录大小
      if (this.fpsHistory.length > this.historySize) {
        this.fpsHistory.shift();
      }
      
      // 重置计数器
      this.frameCount = 0;
      this.lastTime = currentTime;
    }
    
    // 继续下一帧
    this.animationId = requestAnimationFrame(this.measureFPS);
  };
}

// 创建全局FPS监控器实例
export const globalFPSMonitor = new FPSMonitor();