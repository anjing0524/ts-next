# WebSocket K线服务设计说明

## 文档信息
- **创建日期**: 2024-12-28
- **版本**: v1.0
- **维护者**: K线服务开发团队
- **状态**: 最新

## 概述

本文档描述了WebSocket K线数据服务的整体设计架构，包括服务端实现、前端集成、协议统一和端口配置规范。

## 架构组件

### 服务端架构

#### 核心类结构
```typescript
// 主服务类 - 统一WebSocket服务器
export class KlineWebSocketServer {
  // 核心依赖服务
  private wsService: WebSocketService;
  private klineDataService: KlineDataService;
  private dataSyncManager: DataSyncManager;
  private sequenceManager: SequenceManager;
  private clientConnectionManager: ClientConnectionManager;
  private klineDataProvider: KlineDataProvider;
  private realtimeDataGenerator: RealtimeDataGenerator;
  private messageHandler: WebSocketMessageHandler;
}
```

#### 关键服务说明

1. **SequenceManager** - 序列号管理
   - 负责数据版本控制和客户端同步状态跟踪
   - 自动检测并补发缺失数据
   - 支持客户端序列号查询和更新

2. **RealtimeDataGenerator** - 实时数据生成
   - 基于事件驱动的实时K线数据生成
   - 支持可配置的更新间隔和数据点数量
   - 集成FlatBuffers序列化

3. **WebSocketMessageHandler** - 统一消息处理
   - 处理所有新协议消息类型
   - 支持二进制数据传输确认
   - 实现错误处理和响应机制

### 前端架构

#### Worker体系
```typescript
// Worker管理器 - 协调WebSocket和K线渲染
export class WorkerManager {
  private websocketWorker: Worker;
  private klineWorker: Worker;
  
  // 默认WebSocket连接配置
  initialize(websocketUrl = 'ws://localhost:3004') {
    // 初始化WebSocket Worker
    // 初始化K线渲染Worker
  }
}
```

#### 组件集成
- **WebSocketKlineChart**: 主渲染组件，支持可配置WebSocket URL
- **WebSocket Worker**: 处理连接管理、心跳检测、重连机制
- **Kline Worker**: 处理WASM和Canvas渲染操作

## 协议设计

### 端口统一规范
- **服务端口**: 3004 (统一配置)
- **配置位置**: 
  - 服务端: `ws-kline-service/src/index.ts` (PORT常量)
  - 前端: `worker-manager.ts` (默认URL)
  - 测试: `test-server.ts` (日志显示)
  - 文档: `README-FLATBUFFERS.md` (示例代码)

### 支持的消息类型

#### 新协议消息
- `get_initial_data`: 获取初始K线数据
- `data_sync`: 数据同步订阅/取消订阅
- `missing_data_request`: 请求缺失数据
- `ping`: 心跳检测
- `subscribe`/`unsubscribe`: 实时数据订阅管理

#### 同步协议消息  
- `sync_start`: 开始数据同步
- `sync_progress`: 查询同步进度
- `sync_cancel`: 取消同步操作
- `sync_resume`: 恢复中断的同步

### 数据序列化

#### FlatBuffers集成
- **二进制格式**: 高效的零拷贝序列化
- **文件标识符**: KLI1
- **序列号机制**: 每个数据包含唯一递增序列号
- **压缩支持**: 可选的数据压缩传输

#### 数据结构
```typescript
interface KlineItem {
  timestamp: number;  // 时间戳
  open: number;      // 开盘价
  high: number;      // 最高价
  low: number;       // 最低价
  close: number;     // 收盘价
  volume: number;    // 成交量
}
```

## 连接管理

### 客户端状态跟踪
- 连接建立时分配唯一客户端ID
- 维护客户端最后接收的序列号
- 支持连接统计信息查询
- 实现连接生命周期管理

### 心跳与重连
- 定期心跳检测 (ping/pong)
- 自动重连机制
- 连接状态监控
- 错误处理与恢复

## 配置管理

### 环境变量
```bash
# 服务端口配置
PORT=3004
HOST=0.0.0.0

# 性能调优
MAX_PAYLOAD_LENGTH=16777216  # 16MB
IDLE_TIMEOUT=60              # 60秒
MAX_BACKPRESSURE=1048576     # 1MB
```

### 前端配置
```typescript
// WebSocket连接配置
const config = {
  websocketUrl: 'ws://localhost:3004',
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000
};
```

## 性能优化

### 网络优化
- 二进制传输减少30-50%数据量
- 增量更新机制
- 分块传输支持
- 可选压缩算法

### 内存管理
- 序列号历史记录自动清理
- 客户端连接池管理
- 数据缓存策略
- 内存使用监控

## 测试策略

### 单元测试
- 序列号管理器测试
- 连接管理器测试
- 消息处理器测试
- 数据生成器测试

### 集成测试
- 端到端WebSocket通信测试
- 多客户端并发测试
- 数据同步准确性测试
- 异常恢复测试

### 测试命令
```bash
# 运行所有测试
npm test

# 运行集成测试
npm run test:integration

# 启动测试服务器
npm run dev:test
```

## 部署与运维

### 启动命令
```bash
# 开发环境
npm run dev

# 测试环境
npm run dev:test

# 生产环境
npm run build && npm start
```

### 监控指标
- 连接数量统计
- 消息处理速率
- 序列号同步状态
- 内存使用情况
- 错误率监控

## 故障排查

### 常见问题
1. **端口冲突**: 检查3004端口占用情况
2. **连接断开**: 验证心跳配置和网络状态  
3. **数据缺失**: 查看序列号同步状态
4. **性能问题**: 监控内存使用和CPU占用

### 调试工具
- 浏览器开发者工具WebSocket面板
- 服务端日志输出
- 连接状态统计API
- 序列号管理器调试接口

## 后续发展

### 计划功能
- 数据持久化支持
- 负载均衡集群
- 更多技术指标支持
- 移动端适配优化

### 升级路径
- 协议版本兼容性保证
- 平滑升级机制
- 配置迁移工具
- 向后兼容支持