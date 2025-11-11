import { KlineDataProvider } from './kline-data-provider';
import { RealtimeDataGenerator } from './realtime-data-generator';
import { ClientConnectionManager } from './client-connection-manager';
import { SequenceManager } from './sequence-manager';
import { ActionMessage } from '../types';

/**
 * WebSocket消息处理器
 * 负责根据标准协议处理消息，实现业务逻辑
 */
export class WebSocketMessageHandler {
  constructor(
    private klineDataProvider: KlineDataProvider,
    private realtimeDataGenerator: RealtimeDataGenerator,
    private connectionManager: ClientConnectionManager,
    private sequenceManager: SequenceManager
  ) {}

  async handleMessage(clientId: string, message: ActionMessage, ws: any): Promise<void> {
    try {
      switch (message.action) {
        case 'subscribe':
          await this.handleSubscribe(clientId, message, ws);
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(clientId, message, ws);
          break;
        case 'ping':
          this.handlePing(ws);
          break;
        case 'request_data_range':
          await this.handleRequestDataRange(clientId, message, ws);
          break;
        default:
          console.warn(`[MessageHandler] 未知操作: ${(message as any).action}`, { clientId });
          this.sendError(ws, 'UNKNOWN_ACTION', `未知或无效的操作`);
      }
    } catch (error) {
      console.error('[MessageHandler] 处理消息时发生错误', { clientId, error });
      this.sendError(ws, 'MESSAGE_PROCESSING_ERROR', '消息处理失败');
    }
  }

  private async handleSubscribe(clientId: string, message: ActionMessage, ws: any): Promise<void> {
    const { channel, params } = message;
    if (channel !== 'kline' || !params?.symbol || !params?.interval) {
      return this.sendError(ws, 'INVALID_PARAMS', '订阅参数无效，需要 channel, symbol, interval');
    }

    const { symbol, interval } = params;
    const topic = `${channel}_${symbol}_${interval}`;

    try {
      const isFirstSubscriber = this.connectionManager.addSubscription(clientId, topic);
      if (isFirstSubscriber) {
        this.realtimeDataGenerator.startGeneratingForTopic(topic);
      }

      this.sendMessage(ws, { event: 'subscribed', channel: topic, status: '订阅成功' });
      console.log(`[MessageHandler] 客户端 ${clientId} 订阅了 ${topic}`);

      await this.sendInitialData(clientId, ws);
    } catch (error) {
      console.error(`[MessageHandler] 订阅 ${topic} 失败`, { clientId, error });
      this.sendError(ws, 'SUBSCRIPTION_FAILED', '订阅失败');
    }
  }

  private async handleUnsubscribe(
    clientId: string,
    message: ActionMessage,
    ws: any
  ): Promise<void> {
    const { channel, params } = message;
    if (channel !== 'kline' || !params?.symbol || !params?.interval) {
      return this.sendError(ws, 'INVALID_PARAMS', '取消订阅参数无效');
    }

    const { symbol, interval } = params;
    const topic = `${channel}_${symbol}_${interval}`;

    const wasLastSubscriber = this.connectionManager.removeSubscription(clientId, topic);
    if (wasLastSubscriber) {
      this.realtimeDataGenerator.stopGeneratingForTopic(topic);
    }

    this.sendMessage(ws, { event: 'unsubscribed', channel: topic, status: '取消订阅成功' });
    console.log(`[MessageHandler] 客户端 ${clientId} 取消订阅 ${topic}`);
  }

  private handlePing(ws: any): void {
    this.sendMessage(ws, { event: 'pong', ts: Date.now() });
  }

  private async handleRequestDataRange(clientId: string, message: ActionMessage, ws: any): Promise<void> {
    const { params } = message;
    if (typeof params?.from !== 'number' || typeof params?.to !== 'number') {
      return this.sendError(ws, 'INVALID_PARAMS', '数据范围请求参数无效，需要 from 和 to 序列号');
    }

    const { from, to } = params;
    console.log(`[MessageHandler] 客户端 ${clientId} 请求数据范围 [${from}, ${to}]`);

    try {
      const dataRange = this.klineDataProvider.getCachedDataRange(from, to);
      
      this.sendMessage(ws, { 
        event: 'data_range_start', 
        from, 
        to, 
        count: dataRange.length 
      });

      for (const data of dataRange) {
        // 直接发送二进制数据
        ws.send(data, true);
      }

      this.sendMessage(ws, { event: 'data_range_end', from, to });
      console.log(`[MessageHandler] 已向客户端 ${clientId} 发送 ${dataRange.length} 条缓存数据`);

    } catch (error) {
      console.error(`[MessageHandler] 处理数据范围请求失败`, { clientId, from, to, error });
      this.sendError(ws, 'DATA_RANGE_FAILED', '获取数据范围失败');
    }
  }

  private async sendInitialData(clientId: string, ws: any): Promise<void> {
    try {
      const count = 1000;
      const klineData = this.klineDataProvider.generateKlineData(count);
      const sequence = this.sequenceManager.getNextSequence();
      const serializedData = this.klineDataProvider.serializeKlineData(klineData, sequence);

      this.sendMessage(ws, {
        channel: 'kline',
        event: 'snapshot',
        ts: Date.now(),
        sequence: sequence,
      });
      ws.send(serializedData, true);

      this.connectionManager.updateClientSequence(clientId, sequence);
      console.log(`[MessageHandler] 向客户端 ${clientId} 发送了初始数据, 序列号: ${sequence}`);
    } catch (error) {
      console.error('[MessageHandler] 发送初始数据失败', { clientId, error });
      this.sendError(ws, 'INITIAL_DATA_ERROR', '发送初始数据失败');
    }
  }

  private sendMessage(ws: any, message: object): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[MessageHandler] 发送JSON消息失败', error);
    }
  }

  private sendError(ws: any, code: string, message: string): void {
    this.sendMessage(ws, { event: 'error', code, message });
  }
}
