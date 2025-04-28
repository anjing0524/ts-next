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
};

// 生成模拟K线数据（独立函数）- 价格范围在2000-3000之间
function generateKlineData(count: number): KlineItem[] {
  const data: KlineItem[] = [];
  // 使用整数时间戳，避免精度问题
  let currentTimestamp = Math.floor(Date.now() / 1000); // 使用秒级时间戳
  // 初始价格设置在2000-3000范围内
  let currentPrice = 2000 + Math.random() * 1000;

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

    // 生成价格订单量数据
    const volumes: Array<{ price: number; volume: number }> = [];
    // 在价格范围内生成10-20个价格点
    const pricePoints = Math.floor(Math.random() * 11) + 10; // 10-20个价格点
    const fullPriceRange = boundedHigh - boundedLow;

    for (let j = 0; j < pricePoints; j++) {
      // 在价格范围内均匀分布价格点
      const price = parseFloat((boundedLow + (fullPriceRange * j) / (pricePoints - 1)).toFixed(2));
      // 生成该价格点的订单量，越接近收盘价订单量越大
      const distanceRatio = 1 - Math.abs(price - boundedClose) / fullPriceRange;
      const volume = parseFloat((Math.random() * 2000 * distanceRatio + 100).toFixed(2));
      volumes.push({ price, volume });
    }

    data.push({
      timestamp: currentTimestamp,
      open,
      high: boundedHigh,
      low: boundedLow,
      close: boundedClose,
      b_vol,
      s_vol,
      volumes,
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
      `第${i + 1}条: 时间戳=${data[i].timestamp}, 开盘=${data[i].open}, 最高=${data[i].high}, 最低=${data[i].low}, 收盘=${data[i].close}, 买量=${data[i].b_vol}, 卖量=${data[i].s_vol}, 价格点数量=${data[i].volumes.length}`
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
      builder.addOffset(volumeOffsets[i]);
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
    const offset = Kline.KlineItem.endKlineItem(builder);
    itemOffsets.push(offset);
  }

  // 创建items数组
  Kline.KlineData.startItemsVector(builder, itemOffsets.length);
  // 注意：必须倒序添加
  for (let i = itemOffsets.length - 1; i >= 0; i--) {
    builder.addOffset(itemOffsets[i]);
  }
  const itemsVector = builder.endVector();

  // 创建KlineData根对象
  Kline.KlineData.startKlineData(builder);
  Kline.KlineData.addItems(builder, itemsVector);
  Kline.KlineData.addTick(builder,10);
  const klineDataOffset = Kline.KlineData.endKlineData(builder);

  // 完成构建并设置文件标识符
  builder.finish(klineDataOffset, 'KLI1');
  return builder.asUint8Array();
}

// 主处理函数改为POST方法
export async function POST() {
  const startTime = performance.now();

  // 生成数据
  const genStart = performance.now();
  const klineData = generateKlineData(10_000); // 减少数据量以适应更复杂的结构
  console.log(klineData[0]);
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
