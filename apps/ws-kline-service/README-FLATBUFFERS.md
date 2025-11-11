# FlatBuffers K线数据流服务

## 概述

本项目实现了基于FlatBuffers序列化的高性能K线数据WebSocket服务，支持实时数据推送、客户端同步状态管理和缺失数据自动补偿。

## 核心功能

### 🚀 主要特性

- **FlatBuffers序列化**: 使用FlatBuffers进行高效的二进制数据序列化
- **实时数据流**: 支持实时K线数据推送，可配置更新间隔
- **序列号管理**: 完整的数据版本控制和客户端同步状态跟踪
- **缺失数据补偿**: 自动检测并补发客户端缺失的数据
- **连接状态管理**: 完善的WebSocket连接生命周期管理
- **性能监控**: 内置统计信息和性能指标

### 📊 数据结构

#### KlineItem (K线数据项)
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

#### 消息类型

1. **get_initial_data** - 获取初始数据
2. **data_sync** - 数据同步订阅/取消订阅
3. **missing_data_request** - 请求缺失数据
4. **ping** - 心跳检测

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
# 启动标准服务器
npm run dev

# 启动测试服务器（包含详细日志）
npm run dev:test
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行集成测试
npm run test:integration

# 运行单元测试
npm run test:unit

# 监视模式运行测试
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage
```

## API 使用指南

### WebSocket 连接

```javascript
const ws = new WebSocket('ws://localhost:3004');

ws.onopen = () => {
  console.log('连接已建立');
};

ws.onmessage = (event) => {
  if (typeof event.data === 'string') {
    // JSON消息
    const message = JSON.parse(event.data);
    console.log('收到消息:', message);
  } else {
    // 二进制数据 (FlatBuffers)
    const binaryData = new Uint8Array(event.data);
    console.log('收到二进制数据:', binaryData.length, '字节');
  }
};
```

### 获取初始数据

```javascript
// 请求最近100条K线数据
ws.send(JSON.stringify({
  type: 'get_initial_data',
  count: 100
}));
```

### 订阅实时数据

```javascript
// 订阅实时数据更新
ws.send(JSON.stringify({
  type: 'data_sync',
  action: 'subscribe',
  lastSequence: 0  // 从序列号0开始
}));

// 取消订阅
ws.send(JSON.stringify({
  type: 'data_sync',
  action: 'unsubscribe'
}));
```

### 请求缺失数据

```javascript
// 请求特定序列号范围的数据
ws.send(JSON.stringify({
  type: 'missing_data_request',
  sequences: [10, 11, 12, 15]  // 缺失的序列号
}));
```

### 心跳检测

```javascript
// 发送ping
ws.send(JSON.stringify({
  type: 'ping'
}));

// 服务器会响应pong
```

## 架构设计

### 核心组件

1. **KlineDataProvider** - K线数据生成和序列化
2. **RealtimeDataGenerator** - 实时数据生成器
3. **SequenceManager** - 序列号和同步状态管理
4. **ClientConnectionManager** - 客户端连接管理
5. **WebSocketMessageHandler** - 消息处理器
6. **DataSyncManager** - 大数据分块传输管理

### 数据流程

```
[数据生成] → [FlatBuffers序列化] → [序列号分配] → [客户端分发]
     ↓              ↓                    ↓              ↓
[K线数据]    [二进制数据]        [版本控制]    [WebSocket推送]
```

### 序列号管理

- 每个数据更新都分配唯一的递增序列号
- 客户端维护最后接收的序列号
- 服务器跟踪每个客户端的同步状态
- 自动检测和补发缺失的数据

## 配置选项

### 实时数据生成器配置

```typescript
// 设置更新间隔（毫秒）
realtimeDataGenerator.setUpdateInterval(1000); // 1秒更新一次

// 设置数据点数量
realtimeDataGenerator.setDataPointCount(100); // 每次生成100个数据点
```

### 序列号管理器配置

```typescript
// 设置历史记录保留时间（毫秒）
sequenceManager.setRetentionPeriod(24 * 60 * 60 * 1000); // 24小时

// 设置最大序列号记录数
sequenceManager.setMaxRecords(10000);
```

## 性能优化

### FlatBuffers 优势

- **零拷贝**: 直接访问序列化数据，无需反序列化
- **内存效率**: 紧凑的二进制格式，减少内存占用
- **跨平台**: 支持多种编程语言和平台
- **向后兼容**: 支持schema演进，保持向后兼容性

### 网络优化

- **二进制传输**: 相比JSON减少约30-50%的数据传输量
- **增量更新**: 只推送变化的数据
- **压缩支持**: 可选的数据压缩
- **批量传输**: 支持数据分块传输

## 监控和调试

### 统计信息

```javascript
// 获取服务器统计信息
const stats = server.getStats();
console.log('连接数:', stats.connectionCount);
console.log('总消息数:', stats.totalMessages);
console.log('数据更新数:', stats.dataUpdates);
```

### 日志级别

- **INFO**: 基本操作信息
- **DEBUG**: 详细调试信息
- **ERROR**: 错误和异常
- **WARN**: 警告信息

### 常见问题排查

1. **连接断开**: 检查网络状态和心跳配置
2. **数据缺失**: 查看序列号同步状态
3. **性能问题**: 监控内存使用和CPU占用
4. **序列化错误**: 验证FlatBuffers schema定义

## 测试

### 单元测试

```bash
# 测试数据生成器
npm run test:unit -- kline-data-provider

# 测试序列号管理器
npm run test:unit -- sequence-manager

# 测试连接管理器
npm run test:unit -- client-connection-manager
```

### 集成测试

```bash
# 运行完整的集成测试
npm run test:integration
```

### 性能测试

```bash
# 启动测试服务器
npm run dev:test

# 在另一个终端运行性能测试
node performance-test.js
```

## 部署

### 构建生产版本

```bash
npm run build
```

### 启动生产服务器

```bash
npm start
```

### Docker 部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8080
CMD ["npm", "start"]
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

## 许可证

MIT License

## 更新日志

### v0.1.0 (2024-12-19)

- ✨ 初始版本发布
- 🚀 FlatBuffers序列化支持
- 📊 实时数据流功能
- 🔄 序列号管理和同步
- 🧪 完整的测试套件
- 📚 详细的文档和示例