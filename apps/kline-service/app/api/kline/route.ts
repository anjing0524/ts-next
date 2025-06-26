import { NextResponse } from 'next/server';
import * as flatbuffers from 'flatbuffers';
import * as Kline from '@/src/generated/kline';

// K线数据类型定义
type KlineDataItem = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
};

/**
 * 生成模拟K线数据
 * @param count - 数据条数
 * @returns K线数据数组
 */
function generateKlineData(count: number): KlineDataItem[] {
  const data: KlineDataItem[] = [];
  let currentTimestamp = Math.floor(Date.now() / 1000); // 使用秒级时间戳
  let currentPrice = 2000 + Math.random() * 1000; // 价格范围在2000-3000之间

  for (let i = 0; i < count; i++) {
    const open = parseFloat(currentPrice.toFixed(2));

    // 价格波动：-1.5% 到 +1.5%
    const changePercent = (Math.random() - 0.5) * 0.03;
    const close = parseFloat((open * (1 + changePercent)).toFixed(2));

    // 确保价格在2000-3000范围内
    const boundedClose = Math.max(2000, Math.min(3000, close));

    // 计算高低点
    const priceRange = Math.abs(open - boundedClose);
    const extraRange = priceRange * (0.2 + Math.random() * 0.8);

    const high = parseFloat((Math.max(open, boundedClose) + extraRange).toFixed(2));
    const low = parseFloat((Math.min(open, boundedClose) - extraRange).toFixed(2));

    // 确保高低点在合理范围内
    const boundedHigh = Math.max(2000, Math.min(3000, high));
    const boundedLow = Math.max(2000, Math.min(3000, low));

    // 生成成交量和成交额
    const volume = Math.random() * 10000 + 5000; // 成交量在5000-15000之间
    const avgPrice = (boundedHigh + boundedLow) / 2; // 平均价格
    const turnover = parseFloat((volume * avgPrice).toFixed(2)); // 成交额

    data.push({
      timestamp: currentTimestamp,
      open,
      high: boundedHigh,
      low: boundedLow,
      close: boundedClose,
      volume: parseFloat(volume.toFixed(2)),
      turnover,
    });

    // 为下一个周期设置开盘价
    currentPrice = boundedClose;
    // 时间向前推进一分钟(60秒)
    currentTimestamp -= 60;
  }

  return data;
}

/**
 * 使用FlatBuffers序列化K线数据
 * @param data - K线数据数组
 * @param symbol - 交易对符号
 * @param interval - 时间间隔
 * @returns 序列化后的二进制数据
 */
function serializeKlineData(data: KlineDataItem[], symbol: string, interval: string): Uint8Array {
  const builder = new flatbuffers.Builder(1024 * 1024); // 1MB缓冲区

  // 创建KlineData对象数组
  const klineDataOffsets: number[] = [];
  for (const item of data) {
    const klineDataOffset = Kline.KlineData.createKlineData(
      builder,
      BigInt(item.timestamp), // timestamp as uint64
      item.open,
      item.high,
      item.low,
      item.close,
      item.volume,
      item.turnover
    );
    klineDataOffsets.push(klineDataOffset);
  }

  // 创建KlineData数组向量
  Kline.KlineArray.startDataVector(builder, klineDataOffsets.length);
  for (let i = klineDataOffsets.length - 1; i >= 0; i--) {
    builder.addOffset(klineDataOffsets[i]!);
  }
  const dataVector = builder.endVector();

  // 创建字符串
  const symbolOffset = builder.createString(symbol);
  const intervalOffset = builder.createString(interval);

  // 创建KlineArray
  const klineArrayOffset = Kline.KlineArray.createKlineArray(
    builder,
    dataVector,
    symbolOffset,
    intervalOffset
  );

  // 完成构建
  builder.finish(klineArrayOffset);

  return builder.asUint8Array();
}

/**
 * GET /api/kline - 获取K线数据
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
    const interval = url.searchParams.get('interval') || '1m';
    const limit = parseInt(url.searchParams.get('limit') || '100');

    // 生成模拟数据
    const klineData = generateKlineData(Math.min(limit, 1000)); // 最多1000条

    console.log(`生成了 ${klineData.length} 条K线数据，交易对: ${symbol}, 间隔: ${interval}`);

    // 序列化数据
    const serializedData = serializeKlineData(klineData, symbol, interval);

    // 返回二进制数据
    return new NextResponse(serializedData, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': serializedData.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('K线数据生成失败:', error);
    return NextResponse.json(
      {
        error: 'K线数据生成失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kline - 处理K线数据（用于测试反序列化）
 */
export async function POST(request: Request) {
  try {
    const arrayBuffer = await request.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 反序列化数据
    const buffer = new flatbuffers.ByteBuffer(uint8Array);
    const klineArray = Kline.KlineArray.getRootAsKlineArray(buffer);

    const result = {
      symbol: klineArray.symbol(),
      interval: klineArray.interval(),
      dataLength: klineArray.dataLength(),
      data: [] as any[],
    };

    // 解析前10条数据用于验证
    const maxItems = Math.min(10, klineArray.dataLength());
    for (let i = 0; i < maxItems; i++) {
      const item = klineArray.data(i);
      if (item) {
        result.data.push({
          timestamp: Number(item.timestamp()),
          open: item.open(),
          high: item.high(),
          low: item.low(),
          close: item.close(),
          volume: item.volume(),
          turnover: item.turnover(),
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('K线数据处理失败:', error);
    return NextResponse.json(
      {
        error: 'K线数据处理失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
