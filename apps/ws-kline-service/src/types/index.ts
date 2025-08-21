/**
 * K线数据项接口，定义了单条K线数据的结构
 */
export interface KlineItem {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  b_vol: number; // 买成交量
  s_vol: number; // 卖成交量
  volumes: Array<{ price: number; volume: number }>; // 价格档位成交量
  last_price: number; // 最新价
  bid_price: number; // 买一价
  ask_price: number; // 卖一价
}

/**
 * 客户端动作消息接口，定义了客户端与服务端通信的标准格式
 */
export interface ActionMessage {
  action: 'subscribe' | 'unsubscribe' | 'ping' | 'request_data_range';
  channel?: string;
  params?: { 
    symbol?: string;
    interval?: string;
    from?: number; // 起始序列号
    to?: number;   // 结束序列号
    [key: string]: any; 
  };
}

/**
 * 客户端连接状态接口，用于在内存中跟踪每个连接的状态
 */
export interface ClientConnectionState {
  clientId: string;
  lastSequence: number; // 最后同步的序列号
  connectedAt: number; // 连接时间戳
  lastActiveAt: number; // 最后活跃时间
  isSubscribed: boolean; // 是否订阅实时数据
  requestCount: number; // 请求计数
}
