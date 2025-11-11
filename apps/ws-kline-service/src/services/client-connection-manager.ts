import { SequenceManager } from './sequence-manager';

// 本地化配置，移除对已删除文件的依赖
const HEARTBEAT_INTERVAL = 30000;
const CLIENT_TIMEOUT = 60000; // 客户端60秒无响应则超时

// 定义内部使用的数据结构
interface ClientSubscription {
  id: string;
  clientId: string;
  topic: string; // 统一使用topic, e.g., kline_BTC/USDT_1m
  createdAt: number;
}

interface ClientInfo {
  id: string;
  ws: any; // 直接存储ws对象以进行操作
  status: 'connected' | 'disconnected';
  connectedAt: number;
  lastPongAt: number; // 最后一次收到pong的时间
  subscriptions: Map<string, ClientSubscription>; // 使用Map方便查找和删除
}

/**
 * 客户端连接管理器 - 负责管理WebSocket连接、心跳检测和订阅
 */
export class ClientConnectionManager {
  private connections: Map<string, ClientInfo> = new Map();
  private subscriptionsByTopic: Map<string, Set<string>> = new Map(); // topic -> Set<clientId>
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(private sequenceManager: SequenceManager) {
    this.startHeartbeat();
  }

  /**
   * 添加新连接
   */
  addConnection(ws: any): ClientInfo {
    const clientId = this.generateId();
    const connection: ClientInfo = {
      id: clientId,
      ws: ws,
      status: 'connected',
      connectedAt: Date.now(),
      lastPongAt: Date.now(),
      subscriptions: new Map(),
    };
    this.connections.set(clientId, connection);
    console.log(`客户端 ${clientId} 已添加, 当前总连接数: ${this.connections.size}`);
    return connection;
  }

  /**
   * 移除连接
   */
  removeConnection(clientId: string): boolean {
    const connection = this.connections.get(clientId);
    if (!connection) return false;

    // 清理该客户端的所有订阅
    connection.subscriptions.forEach(sub => this.removeSubscription(clientId, sub.topic));

    this.connections.delete(clientId);
    console.log(`客户端 ${clientId} 已移除, 当前总连接数: ${this.connections.size}`);
    return true;
  }

  /**
   * 记录收到pong响应
   */
  recordPong(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.lastPongAt = Date.now();
    }
  }

  /**
   * 添加订阅
   * @returns 返回是否是该主题的第一个订阅者
   */
  addSubscription(clientId: string, topic: string): boolean {
    const connection = this.connections.get(clientId);
    if (!connection || connection.subscriptions.has(topic)) return false;

    const subscription: ClientSubscription = {
      id: this.generateId(),
      clientId,
      topic,
      createdAt: Date.now(),
    };
    connection.subscriptions.set(topic, subscription);

    if (!this.subscriptionsByTopic.has(topic)) {
      this.subscriptionsByTopic.set(topic, new Set());
    }
    const topicSubscribers = this.subscriptionsByTopic.get(topic)!;
    const isFirstSubscriber = topicSubscribers.size === 0;
    topicSubscribers.add(clientId);

    console.log(`客户端 ${clientId} 订阅了 ${topic}`);
    return isFirstSubscriber;
  }

  /**
   * 移除订阅
   * @returns 返回该主题是否已无任何订阅者
   */
  removeSubscription(clientId: string, topic: string): boolean {
    const connection = this.connections.get(clientId);
    if (!connection || !connection.subscriptions.has(topic)) return false;

    connection.subscriptions.delete(topic);

    const topicSubscribers = this.subscriptionsByTopic.get(topic);
    if (topicSubscribers) {
      topicSubscribers.delete(clientId);
      console.log(`客户端 ${clientId} 取消订阅 ${topic}`);
      if (topicSubscribers.size === 0) {
        this.subscriptionsByTopic.delete(topic);
        console.log(`主题 ${topic} 已无订阅者`);
        return true; // 已无订阅者
      }
    }
    return false; // 仍有订阅者
  }

  /**
   * 获取特定主题的订阅者列表
   */
  getSubscribers(topic: string): string[] {
    return Array.from(this.subscriptionsByTopic.get(topic) || []);
  }

  /**
   * 获取指定连接
   */
  getConnection(clientId: string): ClientInfo | undefined {
    return this.connections.get(clientId);
  }

  /**
   * 启动心跳和清理任务
   */
  private startHeartbeat(): void {
    this.stop(); // 确保只有一个定时器在运行
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((conn, clientId) => {
        if (Date.now() - conn.lastPongAt > CLIENT_TIMEOUT) {
          console.log(`客户端 ${clientId} 心跳超时，关闭连接`);
          conn.ws.close();
          // close事件会触发removeConnection
        } else {
          // 发送ping帧，uWebSockets会自动处理
          conn.ws.ping();
        }
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * 停止所有服务
   */
  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public updateClientSequence(clientId: string, sequence: number): void {
    // This method is now just a proxy to the sequence manager if needed,
    // but the core state is managed there.
    this.sequenceManager.updateClientSequence(clientId, sequence);
  }
}