import uWS from 'uWebSockets.js';
import { ClientConnectionManager } from './services/client-connection-manager';
import { RealtimeDataGenerator } from './services/realtime-data-generator';
import { WebSocketMessageHandler } from './services/websocket-message-handler';

const PORT = Number(process.env.PORT) || 3004;
const HOST = process.env.HOST || '0.0.0.0';

// Define the shape of the dependencies required by the server
interface ServerDependencies {
  messageHandler: WebSocketMessageHandler;
  clientConnectionManager: ClientConnectionManager;
  realtimeDataGenerator: RealtimeDataGenerator;
}

export class KlineWebSocketServer {
  private readonly app: uWS.TemplatedApp;
  private readonly messageHandler: WebSocketMessageHandler;
  private readonly clientConnectionManager: ClientConnectionManager;
  private readonly realtimeDataGenerator: RealtimeDataGenerator;

  constructor(deps: ServerDependencies) {
    // Assign injected dependencies
    this.messageHandler = deps.messageHandler;
    this.clientConnectionManager = deps.clientConnectionManager;
    this.realtimeDataGenerator = deps.realtimeDataGenerator;

    // Initialize the server
    this.app = uWS.App();
    this.setupWebSocket();
    this.setupRealtimeDataGenerator();
  }

  private setupRealtimeDataGenerator(): void {
    this.realtimeDataGenerator.on('data_update', (data: {
      topic: string;
      sequence: number;
      data: Uint8Array;
    }) => {
      this.broadcastData(data.topic, data.data, data.sequence);
    });
  }

  private broadcastData(topic: string, data: Uint8Array, sequence: number): void {
    const subscribers = this.clientConnectionManager.getSubscribers(topic);
    if (subscribers.length === 0) return;

    for (const clientId of subscribers) {
      const connection = this.clientConnectionManager.getConnection(clientId);
      if (connection?.ws) {
        try {
          connection.ws.send(data, true);
          this.clientConnectionManager.updateClientSequence(clientId, sequence);
        } catch (e) {
          console.error(`向客户端 ${clientId} 发送数据失败:`, e);
        }
      }
    }
  }

  private setupWebSocket(): void {
    this.app.ws('/*', {
      compression: uWS.SHARED_COMPRESSOR,
      maxPayloadLength: 16 * 1024 * 1024,
      idleTimeout: 70,

      open: (ws: any) => {
        const connection = this.clientConnectionManager.addConnection(ws);
        ws.clientId = connection.id;
        console.log(`客户端 ${connection.id} 已连接`);
        ws.send(JSON.stringify({ event: 'connected', clientId: connection.id }));
      },

      message: async (ws: any, message: ArrayBuffer, isBinary: boolean) => {
        if (ws.clientId && !isBinary) {
          try {
            const data = JSON.parse(Buffer.from(message).toString('utf-8'));
            await this.messageHandler.handleMessage(ws.clientId, data, ws);
          } catch (e) {
            console.error('解析消息失败:', e);
            ws.send(JSON.stringify({ event: 'error', message: '无效的JSON格式' }));
          }
        }
      },

      close: (ws: any, code: number) => {
        if (ws.clientId) {
          this.clientConnectionManager.removeConnection(ws.clientId);
          console.log(`客户端 ${ws.clientId} 已断开连接，代码: ${code}`);
        }
      },

      drain: (ws: any) => {
        console.warn(`WebSocket backpressure for client: ${ws.clientId}`);
      },

      pong: (ws: any) => {
        if (ws.clientId) {
          this.clientConnectionManager.recordPong(ws.clientId);
        }
      },
    });
  }

  public start(): void {
    this.app.listen(HOST, PORT, (token) => {
      if (token) {
        console.log(`🚀 WebSocket K线服务启动成功，监听于 ws://${HOST}:${PORT}`);
      } else {
        console.error(`❌ WebSocket服务启动失败`);
        process.exit(1);
      }
    });
  }

  public stop(): void {
    console.log('正在停止WebSocket服务...');
    this.realtimeDataGenerator.stop();
    this.clientConnectionManager.stop();
    // Note: sequenceManager is not a direct dependency of the server class anymore,
    // its lifecycle could be managed in main.ts if needed.
    console.log('所有服务已停止');
    process.exit(0);
  }
}
