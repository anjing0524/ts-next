import { NextRequest } from 'next/server';
import * as flatbuffers from 'flatbuffers';
import * as Kline from '@/generated/kline';

type KlineItem = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  b_vol: number;
  s_vol: number;
  volumes: Array<{ price: number; volume: number }>;
  last_price: number;
  bid_price: number;
  ask_price: number;
};

class KlineDataGenerator {
  private currentPrice: number;
  private currentTimestamp: number;
  private options: {
    numLevels: number;
    tickSize: number;
    largeOrderRatio: number;
    largeOrderMultiplier: number;
  };

  constructor(options?: {
    numLevels?: number;
    tickSize?: number;
    largeOrderRatio?: number;
    largeOrderMultiplier?: number;
  }) {
    this.options = {
      numLevels: options?.numLevels || 30,
      tickSize: options?.tickSize || 5,
      largeOrderRatio: options?.largeOrderRatio || 0.1,
      largeOrderMultiplier: options?.largeOrderMultiplier || 7.5,
    };
    
    this.currentPrice = 2000 + Math.random() * 1000;
    this.currentTimestamp = Math.floor(Date.now() / 1000);
  }

  generateNext(): KlineItem {
    const open = parseFloat(this.currentPrice.toFixed(2));
    const changePercent = (Math.random() - 0.5) * 0.01;
    const close = parseFloat((open * (1 + changePercent)).toFixed(2));
    const boundedClose = Math.max(2000, Math.min(3000, close));

    const priceRange = Math.abs(open - boundedClose);
    const extraRange = priceRange * (0.2 + Math.random() * 0.8);
    const high = parseFloat((Math.max(open, boundedClose) + extraRange).toFixed(2));
    const low = parseFloat((Math.min(open, boundedClose) - extraRange).toFixed(2));
    const boundedHigh = Math.max(2000, Math.min(3000, high));
    const boundedLow = Math.max(2000, Math.min(3000, low));

    const totalVolume = Math.random() * 10000 + 5000;
    const buyRatio = Math.random();
    const b_vol = parseFloat((totalVolume * buyRatio).toFixed(2));
    const s_vol = parseFloat((totalVolume * (1 - buyRatio)).toFixed(2));

    const lastPriceVariation = (Math.random() - 0.5) * 0.005;
    const last_price = parseFloat((boundedClose * (1 + lastPriceVariation)).toFixed(2));
    const bidVariation = -Math.random() * 0.002;
    const bid_price = parseFloat((last_price * (1 + bidVariation)).toFixed(2));
    const askVariation = Math.random() * 0.002;
    const ask_price = parseFloat((last_price * (1 + askVariation)).toFixed(2));

    const priceLevels = this.generatePriceLevels(boundedClose, boundedHigh, boundedLow);

    const result: KlineItem = {
      timestamp: this.currentTimestamp,
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
    };

    this.currentPrice = boundedClose;
    this.currentTimestamp += 1;

    return result;
  }

  private generatePriceLevels(center: number, high: number, low: number): Array<{ price: number; volume: number }> {
    const priceLevels: Array<{ price: number; volume: number }> = [];
    const sigma = (high - low) / 4 || 1;
    
    const halfLevels = Math.floor(this.options.numLevels / 2);
    const startPrice = Math.floor(center / this.options.tickSize - halfLevels) * this.options.tickSize;
    
    const numLargeOrders = Math.max(1, Math.floor(this.options.numLevels * this.options.largeOrderRatio));
    const largeOrderIndices = new Set<number>();
    
    const numHotSpots = 2 + Math.floor(Math.random() * 2);
    for (let spot = 0; spot < numHotSpots; spot++) {
      const hotSpotCenter = Math.floor(Math.random() * this.options.numLevels);
      const hotSpotRange = 1 + Math.floor(Math.random() * 3);
      
      for (let j = 0; j < hotSpotRange && largeOrderIndices.size < numLargeOrders; j++) {
        const offset = Math.floor(Math.random() * hotSpotRange) - Math.floor(hotSpotRange / 2);
        const index = (hotSpotCenter + offset + this.options.numLevels) % this.options.numLevels;
        largeOrderIndices.add(index);
      }
    }
    
    while (largeOrderIndices.size < numLargeOrders) {
      largeOrderIndices.add(Math.floor(Math.random() * this.options.numLevels));
    }

    for (let i = 0; i < this.options.numLevels; i++) {
      const p = startPrice + i * this.options.tickSize;
      
      const distanceFromCenter = Math.abs(p - center);
      const base = Math.exp(-Math.pow(distanceFromCenter, 2) / (2 * sigma * sigma));
      
      let volume = Math.round(base * (Math.random() * 2500 + 500));
      
      if (largeOrderIndices.has(i)) {
        const distanceFactor = 1 - distanceFromCenter / (sigma * 3);
        const multiplier = this.options.largeOrderMultiplier * (0.7 + 0.3 * distanceFactor);
        volume = Math.round(volume * multiplier);
      }
      
      volume = Math.max(1, volume);
      priceLevels.push({ price: parseFloat(p.toFixed(2)), volume });
    }

    return priceLevels;
  }

  static parseOptions(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    
    return {
      numLevels: searchParams.get('numLevels') ? parseInt(searchParams.get('numLevels')!) : undefined,
      tickSize: searchParams.get('tickSize') ? parseFloat(searchParams.get('tickSize')!) : undefined,
      largeOrderRatio: searchParams.get('largeOrderRatio') ? parseFloat(searchParams.get('largeOrderRatio')!) : undefined,
      largeOrderMultiplier: searchParams.get('largeOrderMultiplier') ? parseFloat(searchParams.get('largeOrderMultiplier')!) : undefined,
    };
  }
}

function serializeKlineItem(item: KlineItem): Uint8Array {
  const builder = new flatbuffers.Builder(1024 * 1024);

  const volumeOffsets: number[] = [];
  for (const vol of item.volumes) {
    const priceVolumeOffset = Kline.PriceVolume.createPriceVolume(builder, vol.price, vol.volume);
    volumeOffsets.push(priceVolumeOffset);
  }

  Kline.KlineItem.startVolumesVector(builder, volumeOffsets.length);
  for (let i = volumeOffsets.length - 1; i >= 0; i--) {
    builder.addOffset(volumeOffsets[i]!);
  }
  const volumesVector = builder.endVector();

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

  builder.finish(offset, 'KLI1');
  return builder.asUint8Array();
}

export async function GET(request: NextRequest) {
  // 解析请求参数
  // numLevels: 价格档位数，默认30，控制volumes数组长度
  // tickSize: 价格档位间隔，默认5，决定价格档位密度
  // largeOrderRatio: 大单比例，默认0.1(10%)，控制大单档位比例
  // largeOrderMultiplier: 大单倍数，默认7.5，大单成交量是普通档位的倍数
  const options = KlineDataGenerator.parseOptions(request);
  const generator = new KlineDataGenerator(options);
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isConnected = true;
      
      const sendData = () => {
        if (!isConnected) return;
        
        try {
          const klineData = generator.generateNext();
          const flatbuffersData = serializeKlineItem(klineData);
          const base64Data = btoa(String.fromCharCode(...flatbuffersData));
          const message = `data: ${base64Data}\n\n`;
          
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('生成数据时出错:', error);
          isConnected = false;
          controller.close();
        }
      };
      
      const intervalId = setInterval(sendData, 250);
      
      request.signal.addEventListener('abort', () => {
        isConnected = false;
        if (intervalId) {
          clearInterval(intervalId);
        }
        controller.close();
      });
    },
    
    cancel() {
      console.log('SSE连接已取消');
    }
  });

  // 返回SSE流响应
  // 每秒推送4次数据（每250ms一次）
  // 每次推送1条K线数据，使用FlatBuffers格式并Base64编码
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}