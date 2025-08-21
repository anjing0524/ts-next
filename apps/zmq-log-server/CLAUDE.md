# ZMQ Log Service - 高性能日志服务

## 服务描述

基于Rust ZMQ和Tokio的高性能日志服务，专注于核心功能：
- ZMQ PULL模式接收日志
- 异步文件写入
- Node.js NAPI绑定客户端
- 按日期分割日志文件

## 核心组件

### 服务端 (zmq-log-server)
- **ZMQ接收器**: 监听 `tcp://*:5555` 接收日志消息
- **日志处理器**: 处理和分类日志条目
- **存储管理器**: 异步写入文件，支持轮转和压缩

### 客户端 (zmq-logger-napi)
- **Node.js绑定**: 提供简单易用的日志API
- **结构化日志**: 支持JSON字段和标签
- **追踪支持**: 内置分布式追踪ID

## 构建和运行

```bash
# 构建Rust服务
cd apps/zmq-log-server && cargo build --release

# 构建Node.js客户端
cd apps/zmq-log-server/zmq-logger-napi && npm run build

# 启动服务
cd apps/zmq-log-server && cargo run --release
```

## ZMQ配置

- **服务端**: `tcp://*:5555` (PULL模式)
- **客户端**: `tcp://localhost:5555` (PUSH模式)

## 配置文件

使用 `config/config.toml` 配置服务：

```toml
[zmq]
bind_address = "0.0.0.0"
port = 5555
high_watermark = 1000
recv_timeout = 100

[storage]
log_dir = "./logs"
max_file_size = 104857600  # 100MB
max_files = 30
enable_compression = true

[processor]
batch_size = 100
worker_threads = 4
```

## Node.js客户端使用

```javascript
const { Logger } = require('./zmq-logger-napi');

const logger = new Logger('tcp://localhost:5555');

// 基本日志
logger.info('Application started');

// 结构化日志
logger.log_with_fields(
  'info',
  'User login',
  JSON.stringify({ userId: '123', action: 'login' }),
  ['auth', 'user']
);

// 带追踪ID的日志
logger.log_with_trace(
  'info',
  'API request',
  'trace-123',
  JSON.stringify({ endpoint: '/api/data' })
);
```

## 日志格式

所有日志以JSON格式存储：

```json
{
  "id": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "level": "info",
  "message": "日志消息",
  "fields": {},
  "tags": [],
  "trace_id": null
}
```

## 环境变量

```bash
RUST_LOG=info                    # Rust日志级别
ZMQ_BIND_ADDRESS=tcp://*:5555    # ZMQ绑定地址
LOG_DIR=./logs                   # 日志目录
MAX_FILE_SIZE=104857600          # 最大文件大小
ENABLE_COMPRESSION=true          # 启用压缩
```

## 性能特性

- 高并发ZMQ消息处理
- 异步文件I/O
- 内存缓冲池
- 批量写入优化
- 自动文件轮转
- 日志压缩

## 文件结构

```
zmq-log-server/
├── src/
│   ├── zmq/          # ZMQ服务器
│   ├── storage/      # 存储管理
│   ├── processor/    # 日志处理
│   ├── config/       # 配置管理
│   └── types/        # 数据类型
├── zmq-logger-napi/  # Node.js客户端
├── config/           # 配置文件
└── logs/            # 日志文件
```