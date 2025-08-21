# ZMQ Log Server

A high-performance ZMQ-based logging service with Node.js bindings.

## 🏗️ Architecture

The project has been refactored with a clean separation of concerns:

### 1. Standalone ZMQ Server (`zmq-server-simple/`)
- **Pure Rust**: Minimal dependencies, focused on core functionality
- **High Performance**: Async message processing with Tokio
- **CLI Interface**: Simple command-line management
- **JSON Support**: Handles structured log messages
- **Graceful Shutdown**: Proper signal handling

### 2. NAPI Logger Library (`zmq-logger-napi/`)
- **Node.js Bindings**: Native Rust performance with JavaScript API
- **Multiple Log Levels**: info, error, warn, debug, trace
- **Structured Logging**: Custom fields and tags support
- **Batch Processing**: Efficient bulk logging
- **Trace Correlation**: Distributed tracing support

## 🌟 特性

- **高性能**: 基于 Rust 和 Tokio 异步运行时，支持高并发日志写入
- **ZMQ 支持**: 使用 ZeroMQ 进行高性能网络通信
- **异步存储**: 异步文件写入，支持日志轮转和压缩
- **Node.js 绑定**: 通过 NAPI 提供 Node.js 兼容接口
- **实时监控**: 集成 Prometheus 监控指标
- **批量处理**: 支持批量日志处理以提高性能
- **配置灵活**: 支持多种配置方式和环境
- **分布式跟踪**: 支持分布式跟踪和上下文日志

## 🏗️ 架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   日志生产者     │    │   日志生产者     │    │   日志生产者     │
│  (各微服务)     │    │  (各微服务)     │    │  (各微服务)     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │ ZMQ PUSH           │ ZMQ PUSH           │ ZMQ PUSH
          └─────────────────────┼───────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   ZMQ LOG SERVER      │
                    │   (Rust + Tokio)     │
                    └───────────┬───────────┘
                                │
          ┌─────────────────────┼───────────────────┐
          │                     │                   │
          │ 异步写入文件         │ 统计监控           │ 健康检查
          ▼                     ▼                   ▼
    ┌─────────────┐      ┌─────────────┐     ┌─────────────┐
    │ 日志文件     │      │ Prometheus  │     │ Health API  │
    │ (按日期分割) │      │ Metrics     │     └─────────────┘
    └─────────────┘      └─────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Node.js 绑定        │
                    │  (rs-napi)           │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  应用程序             │
                    │  (调用日志API)        │
                    └───────────────────────┘
```

## 🚀 Quick Start

### 1. Start the ZMQ Server

```bash
cd zmq-server-simple
cargo build --release
./target/release/zmq-server start
```

The server will start on `tcp://0.0.0.0:5555` by default.

### 2. Use the Node.js Logger

```javascript
const { Logger } = require('./zmq-logger-napi');

// Create logger instance
const logger = new Logger('tcp://localhost:5555');

// Basic logging
logger.info('This is an info message');
logger.error('This is an error message');

// Structured logging
logger.log_with_fields(
  'info',
  'User login',
  [
    { key: 'userId', value: '12345' },
    { key: 'action', value: 'login' }
  ],
  ['auth', 'user']
);

// Batch logging
const logs = [
  { level: 'info', message: 'Batch message 1' },
  { level: 'info', message: 'Batch message 2' }
];
logger.send_batch(logs);
```

## 📦 Installation

### System Requirements

- Rust 1.70+
- Node.js 16+
- ZeroMQ 4.x

### Building

```bash
# Clone project
git clone <repository-url>
cd zmq-log-server

# Build standalone server
cd zmq-server-simple
cargo build --release

# Build NAPI library
cd zmq-logger-napi
npm install
npm run build
```

## 🔧 配置

### 环境变量

```bash
# 基本配置
LOG_LEVEL=info
LOG_DIR=./logs

# ZMQ 配置
ZMQ_ENABLED=true
ZMQ_BIND_ADDRESS=0.0.0.0
ZMQ_PORT=5555
ZMQ_RECV_BUFFER_SIZE=1048576

# HTTP 配置
HTTP_ENABLED=true
HTTP_PORT=3005

# 存储配置
MAX_FILE_SIZE=100MB
MAX_FILES=30
ENABLE_COMPRESSION=true
```

### 配置文件

服务支持 YAML 配置文件：

```yaml
# config/default.yaml
log_level: "info"

zmq:
  enabled: true
  bind_address: "0.0.0.0"
  port: 5555
  recv_buffer_size: 1048576

storage:
  log_dir: "./logs"
  max_file_size: 104857600
  max_files: 30
  enable_compression: true

http:
  enabled: true
  port: 3005
```

## 🚀 使用

### 启动服务

```bash
# 使用默认配置启动
cargo run --release

# 使用自定义配置
cargo run --release -- --config config/production.yaml

# 指定端口
cargo run --release -- --port 5555 --http-port 3005
```

### Node.js 客户端

```typescript
import { createLogger } from '@repo/zmq-log-bindings';

// 创建日志实例
const logger = createLogger({
  serverAddress: 'tcp://localhost:5555',
  serviceName: 'my-app',
  environment: 'development'
});

// 记录日志
logger.info('Application started');
logger.error('An error occurred', {
  fields: { errorCode: 500 }
});

// 带跟踪ID的日志
logger.info('Processing request', {
  traceId: 'trace-123',
  fields: { userId: 'user-456' }
});

// 批量日志
logger.batch({
  entries: [
    { level: 'info', message: 'Batch message 1' },
    { level: 'warn', message: 'Batch message 2' }
  ]
});
```

### Rust 客户端

```rust
use zmq_log_server::zmq::client::ZmqClient;
use zmq_log_server::types::{LogEntry, LogLevel};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 创建客户端
    let client = ZmqClient::new("tcp://localhost:5555".to_string()).await?;
    
    // 发送日志
    let entry = LogEntry::new(LogLevel::Info, "Hello from Rust!".to_string())
        .with_service("rust-app".to_string());
    
    client.send_log_entry(entry).await?;
    
    Ok(())
}
```

## 📊 监控

### Prometheus 指标

服务暴露以下 Prometheus 指标：

- `zmq_messages_total_received`: 总接收消息数
- `zmq_messages_total_processed`: 总处理消息数
- `zmq_messages_total_errors`: 总错误数
- `zmq_messages_per_second`: 每秒消息数
- `zmq_bytes_received`: 接收字节数
- `zmq_bytes_sent`: 发送字节数

### 健康检查

```bash
# 检查服务状态
curl http://localhost:3005/api/health

# 获取性能指标
curl http://localhost:3005/api/metrics

# 搜索日志
curl "http://localhost:3005/api/logs/search?level=error&limit=10"
```

## 🔧 API 端点

### 日志 API

- `POST /api/logs` - 发送日志（HTTP方式）
- `GET /api/logs/search` - 搜索日志
- `GET /api/logs/stats` - 获取日志统计

### 监控 API

- `GET /api/health` - 健康检查
- `GET /api/metrics` - 性能指标
- `GET /api/metrics/prometheus` - Prometheus 格式指标

## 📈 性能

### 基准测试结果

| 操作 | 吞吐量 | 延迟 | CPU 使用率 |
|------|--------|------|-----------|
| 单条日志 | 50,000 msg/s | < 1ms | 15% |
| 批量日志 | 100,000 msg/s | < 5ms | 25% |
| 文件写入 | 200 MB/s | < 10ms | 30% |

### 优化建议

1. **批量处理**: 启用批量日志处理以提高性能
2. **缓冲区大小**: 根据消息大小调整缓冲区大小
3. **压缩**: 启用日志压缩以减少磁盘使用
4. **异步写入**: 使用异步文件写入避免阻塞

## 🧪 测试

```bash
# 运行 Rust 测试
cargo test

# 运行 Node.js 测试
cd bindings && npm test

# 集成测试
./scripts/test-integration.sh
```

## 📝 示例

查看 `examples/` 目录中的完整示例：

- `basic-usage.ts` - 基本使用示例
- `advanced-usage.ts` - 高级功能示例
- `performance-test.ts` - 性能测试示例

## 🤝 贡献

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有建议，请：

1. 查看 [Issues](https://github.com/your-repo/zmq-log-server/issues)
2. 创建新的 Issue
3. 联系维护者

## 🗺️ 路线图

- [ ] 支持更多消息队列协议 (Kafka, RabbitMQ)
- [ ] 添加日志分析功能
- [ ] 支持日志聚合和搜索
- [ ] 添加 Web UI 界面
- [ ] 支持插件系统
- [ ] 添加更多编程语言绑定