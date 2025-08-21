import { EventEmitter } from 'events';
import { KlineDataProvider } from './kline-data-provider';

/**
 * 实时数据生成器 - 按需为不同主题生成数据
 * 负责为每个被订阅的主题（如 kline_BTC/USDT_1m）维护一个独立的定时生成作业。
 */
export class RealtimeDataGenerator extends EventEmitter {
  private activeJobs: Map<string, NodeJS.Timeout> = new Map(); // topic -> intervalId

  constructor(private klineDataProvider: KlineDataProvider) {
    super();
  }

  /**
   * 为指定主题开始生成数据
   * @param topic 主题，例如 'kline_BTC/USDT_1m'
   */
  startGeneratingForTopic(topic: string): void {
    if (this.activeJobs.has(topic)) {
      console.log(`主题 ${topic} 的数据生成作业已在运行`);
      return;
    }

    console.log(`为主题 ${topic} 启动数据生成作业`);

    const intervalMs = this.parseInterval(topic) || 1000;

    const job = setInterval(() => {
      try {
        const newData = this.klineDataProvider.generateRealtimeUpdate();
        const sequence = this.klineDataProvider.getNextSequence();
        const serializedData = this.klineDataProvider.serializeKlineData([newData], sequence);

        this.emit('data_update', {
          topic,
          sequence,
          data: serializedData,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error(`为主题 ${topic} 生成数据时出错:`, error);
        this.emit('error', { topic, error });
      }
    }, intervalMs);

    this.activeJobs.set(topic, job);
  }

  /**
   * 停止为指定主题生成数据
   * @param topic 主题
   */
  stopGeneratingForTopic(topic: string): void {
    const job = this.activeJobs.get(topic);
    if (job) {
      clearInterval(job);
      this.activeJobs.delete(topic);
      console.log(`已停止主题 ${topic} 的数据生成作业`);
    }
  }

  /**
   * 从主题字符串中解析出时间间隔（毫秒）
   * e.g., 'kline_BTC/USDT_1m' -> 60000
   */
  private parseInterval(topic: string): number | null {
    const parts = topic.split('_');
    const intervalStr = parts[parts.length - 1];
    if (!intervalStr) return null;

    const value = parseInt(intervalStr.slice(0, -1));
    const unit = intervalStr.slice(-1).toLowerCase();

    if (isNaN(value)) return null;

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  /**
   * 停止所有正在运行的作业
   */
  public stop(): void {
    console.log('停止所有实时数据生成作业...');
    this.activeJobs.forEach((job) => clearInterval(job));
    this.activeJobs.clear();
  }
}
