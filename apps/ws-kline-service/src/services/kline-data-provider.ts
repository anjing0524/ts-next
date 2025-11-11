import * as flatbuffers from 'flatbuffers';
import { KlineData, KlineItem as FBKlineItem, PriceVolume } from '@repo/flatbuffers-kline';
import { KlineItem } from '../types';

/**
 * K线数据提供者服务
 * 负责生成K线数据和FlatBuffers序列化
 */
export class KlineDataProvider {
  private sequenceNumber = 0;
  private dataCache: Map<number, Uint8Array> = new Map();
  private readonly maxCacheSize = 1000; // 最大缓存条数
  private orderBook: Map<number, number> = new Map(); // Persistent order book

  constructor() {
    this.initializeOrderBook();
  }

  private initializeOrderBook() {
    // 适度扩大价格范围到1800-3200，平衡显示效果和数据大小
    const minPrice = 1800;
    const maxPrice = 3200;
    const centerPrice = 2500;
    
    // 只在部分价格点初始化，减少数据量
    for (let price = minPrice; price <= maxPrice; price += 2) { // 步长为2，减少一半数据点
      const distanceFromCenter = Math.abs(price - centerPrice);
      const maxDistance = Math.max(centerPrice - minPrice, maxPrice - centerPrice);
      const proximityFactor = 1 - (distanceFromCenter / maxDistance);
      
      // 基础流动性更小，避免数据膨胀
      const baseVolume = Math.random() * 30 + 5;
      const volumeMultiplier = 0.2 + proximityFactor * 1.5;
      this.orderBook.set(price, baseVolume * volumeMultiplier);
    }
  }

  /**
   * 生成模拟K线数据
   * @param count 生成数据条数
   * @param options 生成选项
   * @returns K线数据数组
   */
  generateKlineData(
    count: number,
    options?: {
      numLevels?: number;
      tickSize?: number;
      largeOrderRatio?: number;
      largeOrderMultiplier?: number;
    }
  ): KlineItem[] {
    const data: KlineItem[] = [];
    let currentTimestamp = Math.floor(Date.now() / 1000);
    let lastPrice = 2500 + (Math.random() - 0.5) * 500; // Start with a more stable price

    for (let i = 0; i < count; i++) {
      const open = lastPrice;
      const changePercent = (Math.random() - 0.5) * 0.02; // Reduced volatility
      let close = open * (1 + changePercent);

      // 适度放宽价格波动范围
      close = Math.max(2000, Math.min(3000, close));

      const high = Math.max(open, close) * (1 + Math.random() * 0.005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.005);

      const totalVolume = Math.random() * 8000 + 2000; // More stable volume
      const buyRatio = 0.45 + Math.random() * 0.1; // Bias towards more balanced
      const b_vol = totalVolume * buyRatio;
      const s_vol = totalVolume * (1 - buyRatio);

      const last_price = close;
      const bid_price = last_price * (1 - Math.random() * 0.001);
      const ask_price = last_price * (1 + Math.random() * 0.001);

      // --- Improved Price Level Generation for Heatmap ---
      this.updateOrderBook(lastPrice);
      const priceLevels = Array.from(this.orderBook.entries()).map(([price, volume]) => ({ price, volume }));

      data.push({
        timestamp: currentTimestamp,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        b_vol: parseFloat(b_vol.toFixed(2)),
        s_vol: parseFloat(s_vol.toFixed(2)),
        volumes: priceLevels,
        last_price: parseFloat(last_price.toFixed(2)),
        bid_price: parseFloat(bid_price.toFixed(2)),
        ask_price: parseFloat(ask_price.toFixed(2)),
      });

      lastPrice = close;
      currentTimestamp -= 60; // Decrement for historical data
    }
    return data.reverse(); // Ensure data is chronological
  }

  private updateOrderBook(currentPrice: number) {
    // 适度扩展订单流范围，控制数据量
    for (let i = 0; i < 25; i++) { // 减少循环次数
      const priceOffset = (Math.random() - 0.5) * 160; // 适度扩大到±80价格单位
      const price = Math.round(currentPrice + priceOffset);
      const volume = Math.random() * 100 + 20; // 减少基础成交量

      // 确保价格在合理范围内
      if (price >= 1800 && price <= 3200) {
        if (this.orderBook.has(price)) {
          if (Math.random() > 0.7) { // 适度降低删除概率
            this.orderBook.delete(price);
          } else {
            this.orderBook.set(price, this.orderBook.get(price)! + volume);
          }
        } else {
          // 只在步长为2的价格点上添加订单，减少数据量
          if (price % 2 === 0) {
            this.orderBook.set(price, volume);
          }
        }
      }
    }

    // 适度的大单生成
    if (Math.random() > 0.85) {
      const price = Math.round(currentPrice + (Math.random() - 0.5) * 80);
      const volume = Math.random() * 1000 + 400;
      if (price >= 1800 && price <= 3200 && price % 2 === 0) {
        this.orderBook.set(price, volume);
      }
    }

    // 关键价位支撑阻力
    if (Math.random() > 0.95) {
      const supportLevel = Math.round(currentPrice / 10) * 10;
      const volume = Math.random() * 2000 + 800;
      if (supportLevel >= 1800 && supportLevel <= 3200) {
        this.orderBook.set(supportLevel, (this.orderBook.get(supportLevel) || 0) + volume);
      }
    }
  }

  /**
   * 将K线数据序列化为FlatBuffers格式
   * @param data K线数据数组
   * @param sequence 序列号
   * @returns 序列化后的二进制数据
   */
  serializeKlineData(data: KlineItem[], sequence?: number): Uint8Array {
    const builder = new flatbuffers.Builder(60 * 1024 * 1024);
    const bAny = builder as unknown as any; // 兼容不同版本的 flatbuffers Builder

    // 打印前3条数据用于调试
    console.log('序列化前的前3条数据:');
    for (let i = 0; i < Math.min(3, data.length); i++) {
      console.log(
        `第${i + 1}条: 时间戳=${data[i]!.timestamp}, 开盘=${data[i]!.open}, 最高=${data[i]!.high}, 最低=${data[i]!.low}, 收盘=${data[i]!.close}, 买量=${data[i]!.b_vol}, 卖量=${data[i]!.s_vol}, 最新价=${data[i]!.last_price}, 买一价=${data[i]!.bid_price}, 卖一价=${data[i]!.ask_price}, 价格点数量=${data[i]!.volumes.length}`
      );
    }
    console.log('Serializing data for sequence:', sequence);

    // 创建KlineItem对象数组
    const itemOffsets: number[] = [];
    for (const item of data) {
      // 创建价格订单量数组
      const volumeOffsets: number[] = [];
      for (const vol of item.volumes) {
        // 创建PriceVolume对象
        PriceVolume.startPriceVolume(builder);
        PriceVolume.addPrice(builder, vol.price);
        PriceVolume.addVolume(builder, vol.volume);
        const priceVolumeOffset = PriceVolume.endPriceVolume(builder);
        volumeOffsets.push(priceVolumeOffset);
      }

      // 创建volumes数组
      FBKlineItem.startVolumesVector(builder, volumeOffsets.length);
      // 注意：必须倒序添加
      for (let i = volumeOffsets.length - 1; i >= 0; i--) {
        builder.addOffset(volumeOffsets[i]!);
      }
      const volumesVector = builder.endVector();

      // 使用startKlineItem和endKlineItem创建table对象
      FBKlineItem.startKlineItem(builder);
      FBKlineItem.addTimestamp(builder, item.timestamp);
      FBKlineItem.addOpen(builder, item.open);
      FBKlineItem.addHigh(builder, item.high);
      FBKlineItem.addLow(builder, item.low);
      FBKlineItem.addClose(builder, item.close);
      FBKlineItem.addBVol(builder, item.b_vol);
      FBKlineItem.addSVol(builder, item.s_vol);
      FBKlineItem.addVolumes(builder, volumesVector);
      FBKlineItem.addLastPrice(builder, item.last_price);
      FBKlineItem.addBidPrice(builder, item.bid_price);
      FBKlineItem.addAskPrice(builder, item.ask_price);
      const offset = FBKlineItem.endKlineItem(builder);
      itemOffsets.push(offset);
    }

    // 创建items数组
    KlineData.startItemsVector(builder, itemOffsets.length);
    // 注意：必须倒序添加
    for (let i = itemOffsets.length - 1; i >= 0; i--) {
      builder.addOffset(itemOffsets[i]!);
    }
    const itemsVector = builder.endVector();

    // 创建KlineData根对象
    KlineData.startKlineData(builder);
    KlineData.addItems(builder, itemsVector);
    KlineData.addTick(builder, 10);
    const klineDataOffset = KlineData.endKlineData(builder);

    // 完成构建并设置文件标识符
    builder.finish(klineDataOffset, 'KLI1');
    const result = builder.asUint8Array();

    // 缓存数据
    if (sequence) {
      this.cacheData(sequence, result);
    }

    return result;
  }

  /**
   * 生成单个实时K线数据更新
   * @param basePrice 基础价格
   * @returns 单个K线数据
   */
  generateRealtimeUpdate(basePrice?: number): KlineItem {
    const data = this.generateKlineData(1, {
      numLevels: 50,        // 增加价格档位
      tickSize: 10,         // 增大 tick，减少过度分散
      largeOrderRatio: 0.15, // 增加大单比例
      largeOrderMultiplier: 3.0, // 大单倍数
    });
    return data[0]!;
  }

  /**
   * 获取下一个序列号
   * @returns 序列号
   */
  getNextSequence(): number {
    return ++this.sequenceNumber;
  }

  /**
   * 获取当前序列号
   * @returns 当前序列号
   */
  getCurrentSequence(): number {
    return this.sequenceNumber;
  }

  /**
   * 缓存序列化数据
   * @param sequence 序列号
   * @param data 序列化数据
   */
  private cacheData(sequence: number, data: Uint8Array): void {
    this.dataCache.set(sequence, data);

    // 清理过期缓存
    if (this.dataCache.size > this.maxCacheSize) {
      const oldestKey = Math.min(...this.dataCache.keys());
      this.dataCache.delete(oldestKey);
    }
  }

  /**
   * 仅用于测试：将序列化数据写入缓存
   * @param sequence 序列号
   * @param data 二进制数据
   */
  public cacheDataForTest(sequence: number, data: Uint8Array): void {
    this.cacheData(sequence, data);
  }

  /**
   * 获取缓存的数据
   * @param sequence 序列号
   * @returns 缓存的数据或null
   */
  getCachedData(sequence: number): Uint8Array | null {
    return this.dataCache.get(sequence) || null;
  }

  /**
   * 获取指定范围的缓存数据
   * @param fromSequence 起始序列号
   * @param toSequence 结束序列号
   * @returns 缓存数据数组
   */
  getCachedDataRange(fromSequence: number, toSequence: number): Uint8Array[] {
    const result: Uint8Array[] = [];
    for (let seq = fromSequence; seq <= toSequence; seq++) {
      const data = this.dataCache.get(seq);
      if (data) {
        result.push(data);
      }
    }
    return result;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.dataCache.clear();
  }
}
