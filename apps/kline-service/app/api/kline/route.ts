import { NextResponse } from 'next/server';
import * as flatbuffers from 'flatbuffers';
import * as Kline from '@/generated/kline';

// 扩展类型定义，包含买卖成交量和价格订单量
type KlineItem = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  b_vol: number; // 买方成交量
  s_vol: number; // 卖方成交量
  volumes: Array<{ price: number; volume: number }>; // 价格订单量数组
  last_price: number; // 最新成交价
  bid_price: number; // 买一价
  ask_price: number; // 卖一价
};

// 生成模拟K线数据（独立函数）- 价格范围在2000-3000之间
function generateKlineData(
  count: number,
  options?: {
    numLevels?: number; // 档位数，默认30档
    tickSize?: number; // 价格档位间隔，默认5
    largeOrderRatio?: number; // 大单比例，默认0.1 (10%)
    largeOrderMultiplier?: number; // 大单倍数，默认5-10倍
  }
): KlineItem[] {
  const data: KlineItem[] = [];
  // 使用整数时间戳，避免精度问题
  let currentTimestamp = Math.floor(Date.now() / 1000); // 使用秒级时间戳
  // 初始价格设置在2000-3000范围内
  let currentPrice = 2000 + Math.random() * 1000;

  // 设置默认参数
  const numLevels = options?.numLevels || 30; // 默认30档
  const tickSize = options?.tickSize || 5; // 默认价格间隔为5
  const largeOrderRatio = options?.largeOrderRatio || 0.1; // 默认10%的档位是大单
  const largeOrderMultiplier = options?.largeOrderMultiplier || 5 + Math.random() * 5; // 默认5-10倍

  for (let i = 0; i < count; i++) {
    const open = parseFloat(currentPrice.toFixed(2)); // 保留两位小数，避免精度问题

    // 更真实的价格波动 - 使用百分比变化而不是固定值
    // 通常股票日内波动在0.5%-3%之间
    const changePercent = (Math.random() - 0.5) * 0.03; // -1.5% 到 +1.5% 的波动
    const close = parseFloat((open * (1 + changePercent)).toFixed(2));

    // 确保价格在2000-3000范围内
    const boundedClose = Math.max(2000, Math.min(3000, close));

    // 高点和低点的计算 - 基于开盘价和收盘价的范围
    const priceRange = Math.abs(open - boundedClose);
    const extraRange = priceRange * (0.2 + Math.random() * 0.8); // 额外波动范围

    const high = parseFloat((Math.max(open, boundedClose) + extraRange).toFixed(2));
    const low = parseFloat((Math.min(open, boundedClose) - extraRange).toFixed(2));

    // 确保高低点也在合理范围内
    const boundedHigh = Math.max(2000, Math.min(3000, high));
    const boundedLow = Math.max(2000, Math.min(3000, low));

    // 生成买卖成交量数据
    const totalVolume = Math.random() * 10000 + 5000; // 总成交量在5000-15000之间
    const buyRatio = Math.random(); // 买卖比例
    const b_vol = parseFloat((totalVolume * buyRatio).toFixed(2));
    const s_vol = parseFloat((totalVolume * (1 - buyRatio)).toFixed(2));

    // 生成最新价、买一价、卖一价
    // 最新价通常在收盘价附近波动
    const lastPriceVariation = (Math.random() - 0.5) * 0.01; // -0.5% 到 +0.5% 的波动
    const last_price = parseFloat((boundedClose * (1 + lastPriceVariation)).toFixed(2));

    // 买一价通常略低于最新价
    const bidVariation = -Math.random() * 0.005; // -0.5% 到 0% 的波动
    const bid_price = parseFloat((last_price * (1 + bidVariation)).toFixed(2));

    // 卖一价通常略高于最新价
    const askVariation = Math.random() * 0.005; // 0% 到 +0.5% 的波动
    const ask_price = parseFloat((last_price * (1 + askVariation)).toFixed(2));

    // 生成价格订单量数据（多档位，tick区分，含大单）
    const priceLevels: Array<{ price: number; volume: number }> = [];
    const center = boundedClose;
    const sigma = (boundedHigh - boundedLow) / 4 || 1; // 防止除0，调整sigma使分布更集中

    // 计算价格范围，确保覆盖足够的价格区间
    const halfLevels = Math.floor(numLevels / 2);
    const startPrice = Math.floor(center / tickSize - halfLevels) * tickSize;

    // 确定大单数量
    const numLargeOrders = Math.max(1, Math.floor(numLevels * largeOrderRatio));

    // 随机选择大单位置，但确保分布更自然（集中在某些区域）
    const largeOrderIndices = new Set<number>();
    // 创建2-3个热点区域
    const numHotSpots = 2 + Math.floor(Math.random() * 2); // 2-3个热点
    for (let spot = 0; spot < numHotSpots; spot++) {
      // 热点中心位置
      const hotSpotCenter = Math.floor(Math.random() * numLevels);
      // 热点范围
      const hotSpotRange = 1 + Math.floor(Math.random() * 3); // 1-3个连续档位

      // 在热点范围内随机选择大单位置
      for (let j = 0; j < hotSpotRange && largeOrderIndices.size < numLargeOrders; j++) {
        const offset = Math.floor(Math.random() * hotSpotRange) - Math.floor(hotSpotRange / 2);
        const index = (hotSpotCenter + offset + numLevels) % numLevels; // 确保在有效范围内
        largeOrderIndices.add(index);
      }
    }

    // 如果大单数量不足，随机补充
    while (largeOrderIndices.size < numLargeOrders) {
      largeOrderIndices.add(Math.floor(Math.random() * numLevels));
    }

    // 生成所有价格档位
    for (let i = 0; i < numLevels; i++) {
      const p = startPrice + i * tickSize;

      // 基础成交量 - 使用改进的高斯分布
      // 价格越接近中心价格，成交量越大
      const distanceFromCenter = Math.abs(p - center);
      const base = Math.exp(-Math.pow(distanceFromCenter, 2) / (2 * sigma * sigma));

      // 基础成交量范围：500-3000
      let volume = Math.round(base * (Math.random() * 2500 + 500));

      // 如果是大单档位，增加成交量
      if (largeOrderIndices.has(i)) {
        // 大单倍数：5-10倍，但根据距离中心的远近有所调整
        // 距离中心越近，大单倍数越大
        const distanceFactor = 1 - distanceFromCenter / (sigma * 3); // 0-1之间，越近越大
        const multiplier = largeOrderMultiplier * (0.7 + 0.3 * distanceFactor);
        volume = Math.round(volume * multiplier);
      }

      // 确保成交量至少为1
      volume = Math.max(1, volume);

      priceLevels.push({ price: parseFloat(p.toFixed(2)), volume });
    }

    data.push({
      timestamp: currentTimestamp,
      open,
      high: boundedHigh,
      low: boundedLow,
      close: boundedClose,
      b_vol,
      s_vol,
      volumes: priceLevels,
      last_price,
      bid_price,
      ask_price,
    });

    // 为下一个周期设置开盘价
    currentPrice = boundedClose;

    // 时间向前推进一分钟(60秒)
    currentTimestamp -= 60;
  }
  return data;
}

// FlatBuffers序列化函数（独立函数）
function serializeKlineData(data: KlineItem[]): Uint8Array {
  const builder = new flatbuffers.Builder(60 * 1024 * 1024);

  // 打印前3条数据用于调试
  console.log('序列化前的前3条数据:');
  for (let i = 0; i < Math.min(3, data.length); i++) {
    console.log(
      `第${i + 1}条: 时间戳=${data[i]!.timestamp}, 开盘=${data[i]!.open}, 最高=${data[i]!.high}, 最低=${data[i]!.low}, 收盘=${data[i]!.close}, 买量=${data[i]!.b_vol}, 卖量=${data[i]!.s_vol}, 最新价=${data[i]!.last_price}, 买一价=${data[i]!.bid_price}, 卖一价=${data[i]!.ask_price}, 价格点数量=${data[i]!.volumes.length}`
    );
  }

  // 创建KlineItem对象数组
  const itemOffsets: number[] = [];
  for (const item of data) {
    // 创建价格订单量数组
    const volumeOffsets: number[] = [];
    for (const vol of item.volumes) {
      // 创建PriceVolume对象
      const priceVolumeOffset = Kline.PriceVolume.createPriceVolume(builder, vol.price, vol.volume);
      volumeOffsets.push(priceVolumeOffset);
    }

    // 创建volumes数组
    Kline.KlineItem.startVolumesVector(builder, volumeOffsets.length);
    // 注意：必须倒序添加
    for (let i = volumeOffsets.length - 1; i >= 0; i--) {
      builder.addOffset(volumeOffsets[i]!);
    }
    const volumesVector = builder.endVector();

    // 使用startKlineItem和endKlineItem创建table对象
    Kline.KlineItem.startKlineItem(builder);
    Kline.KlineItem.addTimestamp(builder, item.timestamp);
    Kline.KlineItem.addOpen(builder, item.open);
    Kline.KlineItem.addHigh(builder, item.high);
    Kline.KlineItem.addLow(builder, item.low);
    Kline.KlineItem.addClose(builder, item.close);
    Kline.KlineItem.addBVol(builder, item.b_vol);
    Kline.KlineItem.addSVol(builder, item.s_vol);
    Kline.KlineItem.addVolumes(builder, volumesVector);
    Kline.KlineItem.addLastPrice(builder, item.last_price);
    Kline.KlineItem.addBidPrice(builder, item.bid_price);
    Kline.KlineItem.addAskPrice(builder, item.ask_price);
    const offset = Kline.KlineItem.endKlineItem(builder);
    itemOffsets.push(offset);
  }

  // 创建items数组
  Kline.KlineData.startItemsVector(builder, itemOffsets.length);
  // 注意：必须倒序添加
  for (let i = itemOffsets.length - 1; i >= 0; i--) {
    builder.addOffset(itemOffsets[i]!);
  }
  const itemsVector = builder.endVector();

  // 创建KlineData根对象
  Kline.KlineData.startKlineData(builder);
  Kline.KlineData.addItems(builder, itemsVector);
  Kline.KlineData.addTick(builder, 10);
  const klineDataOffset = Kline.KlineData.endKlineData(builder);

  // 完成构建并设置文件标识符
  builder.finish(klineDataOffset, 'KLI1');
  return builder.asUint8Array();
}

// 主处理函数改为POST方法
export async function POST(request: Request) {
  const startTime = performance.now();

  // 尝试从请求中获取参数
  let options = {};
  try {
    const url = new URL(request.url);
    const numLevels = url.searchParams.get('numLevels');
    const tickSize = url.searchParams.get('tickSize');
    const largeOrderRatio = url.searchParams.get('largeOrderRatio');

    if (numLevels || tickSize || largeOrderRatio) {
      options = {
        numLevels: numLevels ? parseInt(numLevels) : undefined,
        tickSize: tickSize ? parseFloat(tickSize) : undefined,
        largeOrderRatio: largeOrderRatio ? parseFloat(largeOrderRatio) : undefined,
      };
    }
  } catch (e) {
    console.log('解析请求参数失败，使用默认参数', e);
  }

  // 生成数据
  const genStart = performance.now();
  const klineData = generateKlineData(1000, options); // 使用可选参数
  console.log('生成数据示例:', klineData[0]);
  console.log(`档位数: ${klineData[0]!.volumes.length}`);
  const genEnd = performance.now();

  // 序列化数据
  const serializeStart = performance.now();
  const buf = serializeKlineData(klineData);
  const serializeEnd = performance.now();

  const totalEnd = performance.now();

  // 性能日志
  console.log('\n====== 性能报告 ======');
  console.log(`数据生成耗时: ${(genEnd - genStart).toFixed(2)}ms`);
  console.log(`序列化耗时: ${(serializeEnd - serializeStart).toFixed(2)}ms`);
  console.log(`总耗时: ${(totalEnd - startTime).toFixed(2)}ms`);
  console.log(
    `序列化速率: ${((klineData.length / (serializeEnd - serializeStart)) * 1000).toFixed(0)}条/秒`
  );
  console.log(`数据体积: ${(buf.length / 1024 / 1024).toFixed(2)}MB`);
  console.log('======================\n');

  // 返回二进制响应
  // 在返回响应前添加验证
  if (buf.length === 0) {
    throw new Error('序列化数据为空');
  }

  // 修改验证逻辑
  const FILE_IDENTIFIER = 'KLI1';
  const identifier = String.fromCharCode(...Array.from(buf.slice(4, 8)));
  if (identifier !== FILE_IDENTIFIER) {
    throw new Error(`FlatBuffers标识符验证失败，期望: ${FILE_IDENTIFIER}，实际: ${identifier}`);
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
