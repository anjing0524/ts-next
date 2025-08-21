# @repo/zmq-logger-client - ZMQ 日志客户端

高性能 ZMQ 日志客户端，为 Node.js 应用提供结构化日志记录功能。

## 特性

- 🚀 高性能 ZMQ 通信
- 📊 结构化日志记录
- 🏷️ 标签和追踪支持
- 🔄 自动重连机制
- 📦 预编译二进制文件
- 🔧 TypeScript 支持

## 安装

```bash
npm install @repo/zmq-logger-client
```

## 快速开始

### 1. 基本使用

```typescript
import { Logger } from '@repo/zmq-logger-client';

// 创建日志实例
const logger = new Logger('tcp://localhost:5555');

// 基本日志级别
logger.info('应用程序启动');
logger.error('数据库连接失败');
logger.warn('配置文件格式错误');
logger.debug('调试信息');
logger.trace('追踪信息');
```

### 2. 结构化日志

```typescript
import { Logger } from '@repo/zmq-logger-client';

const logger = new Logger('tcp://localhost:5555');

// 带字段的日志
logger.logWithFields(
  'info',
  '用户登录',
  {
    userId: '12345',
    action: 'login',
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0...'
  },
  ['auth', 'user', 'security']
);

// 带追踪ID的日志
logger.logWithTrace(
  'info',
  'API 请求处理',
  'trace-123-456-789',
  {
    endpoint: '/api/users',
    method: 'GET',
    responseTime: 156
  }
);
```

### 3. Express.js 集成

```typescript
import express from 'express';
import { Logger } from '@repo/zmq-logger-client';

const app = express();
const logger = new Logger('tcp://localhost:5555');

// 请求中间件
app.use((req, res, next) => {
  const traceId = req.headers['x-trace-id'] || `trace-${Date.now()}`;
  
  // 记录请求开始
  logger.logWithTrace(
    'info',
    `请求开始: ${req.method} ${req.path}`,
    traceId as string,
    {
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.get('user-agent')
    }
  );
  
  // 将 traceId 添加到请求对象
  req.traceId = traceId;
  
  // 监听响应完成
  res.on('finish', () => {
    logger.logWithTrace(
      'info',
      `请求完成: ${req.method} ${req.path}`,
      traceId as string,
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime: Date.now() - req.startTime
      }
    );
  });
  
  req.startTime = Date.now();
  next();
});

// 路由示例
app.get('/api/users', async (req, res) => {
  try {
    logger.logWithTrace(
      'debug',
      '查询用户列表',
      req.traceId,
      { page: req.query.page, limit: req.query.limit }
    );
    
    // 业务逻辑...
    const users = await getUsers();
    
    res.json({ success: true, data: users });
  } catch (error) {
    logger.logWithTrace(
      'error',
      '查询用户失败',
      req.traceId,
      { error: error.message, stack: error.stack }
    );
    
    res.status(500).json({ success: false, error: '内部服务器错误' });
  }
});
```

### 4. React/Vite 应用集成

```typescript
// src/utils/logger.ts
import { Logger } from '@repo/zmq-logger-client';

export const logger = new Logger(
  import.meta.env.VITE_ZMQ_LOGGER_URL || 'ws://localhost:5555'
);

// 在组件中使用
import { logger } from '@/utils/logger';

const UserComponent = () => {
  const handleClick = () => {
    logger.logWithFields(
      'info',
      '用户点击按钮',
      {
        component: 'UserComponent',
        action: 'click',
        timestamp: new Date().toISOString()
      },
      ['ui', 'user-interaction']
    );
  };
  
  return <button onClick={handleClick}>点击我</button>;
};
```

## API 参考

### 构造函数

```typescript
constructor(serverAddress: string)
```

- `serverAddress`: ZMQ 服务器地址，例如 `tcp://localhost:5555`

### 方法

#### 基本日志方法

```typescript
info(message: string): void
error(message: string): void
warn(message: string): void
debug(message: string): void
trace(message: string): void
```

#### 高级日志方法

```typescript
logWithFields(
  level: string,
  message: string,
  fields?: object,
  tags?: string[]
): void

logWithTrace(
  level: string,
  message: string,
  traceId: string,
  fields?: object
): void
```

#### 工具方法

```typescript
isConnected(): boolean
getStats(): ClientStats
```

### 类型定义

```typescript
interface ClientStats {
  isConnected: boolean;
  messagesSent: number;
  bytesSent: number;
  lastError?: string;
}
```

## 配置

### 环境变量

```bash
# ZMQ 服务器地址
ZMQ_LOGGER_URL=tcp://localhost:5555

# 日志级别
LOG_LEVEL=info

# 是否启用日志
ENABLE_LOGGER=true
```

### 构建配置

```json
{
  "scripts": {
    "build": "napi build --release",
    "prebuild": "napi prebuild",
    "postinstall": "node -e \"require('child_process').exec('npm run prebuild')\""
  }
}
```

## 错误处理

```typescript
import { Logger } from '@repo/zmq-logger-client';

const logger = new Logger('tcp://localhost:5555');

// 检查连接状态
if (!logger.isConnected()) {
  console.warn('ZMQ 日志服务未连接，将使用控制台日志');
}

// 获取统计信息
const stats = logger.getStats();
console.log('日志统计:', stats);

// 错误处理示例
try {
  logger.info('测试日志');
} catch (error) {
  console.error('日志发送失败:', error);
  // 降级到控制台日志
  console.log('降级日志:', '测试日志');
}
```

## 性能优化

### 1. 批量发送

```typescript
// 创建批量日志处理器
class BatchLogger {
  private logs: any[] = [];
  private timer: NodeJS.Timeout;
  
  constructor(private logger: Logger, private batchSize = 100) {
    this.timer = setInterval(() => this.flush(), 1000);
  }
  
  log(level: string, message: string, fields?: any, tags?: string[]) {
    this.logs.push({ level, message, fields, tags, timestamp: Date.now() });
    
    if (this.logs.length >= this.batchSize) {
      this.flush();
    }
  }
  
  private flush() {
    if (this.logs.length === 0) return;
    
    this.logger.logWithFields(
      'info',
      `批量日志: ${this.logs.length} 条`,
      {
        count: this.logs.length,
        logs: this.logs
      },
      ['batch']
    );
    
    this.logs = [];
  }
}
```

### 2. 内存缓存

```typescript
// 内存缓存日志，在网络恢复后发送
class CachedLogger {
  private cache: any[] = [];
  private isConnected = false;
  
  constructor(private logger: Logger) {
    this.checkConnection();
    setInterval(() => this.checkConnection(), 5000);
  }
  
  log(level: string, message: string, fields?: any, tags?: string[]) {
    const logEntry = { level, message, fields, tags, timestamp: Date.now() };
    
    if (this.isConnected) {
      this.sendLog(logEntry);
    } else {
      this.cache.push(logEntry);
      if (this.cache.length > 1000) {
        this.cache.shift(); // 移除最旧的日志
      }
    }
  }
  
  private async checkConnection() {
    this.isConnected = this.logger.isConnected();
    
    if (this.isConnected && this.cache.length > 0) {
      // 发送缓存的日志
      for (const log of this.cache) {
        this.sendLog(log);
      }
      this.cache = [];
    }
  }
  
  private sendLog(log: any) {
    try {
      this.logger.logWithFields(log.level, log.message, log.fields, log.tags);
    } catch (error) {
      console.error('发送日志失败:', error);
    }
  }
}
```

## 故障排除

### 常见问题

1. **连接失败**
   - 检查 ZMQ 服务器是否启动
   - 确认网络连接正常
   - 验证服务器地址格式

2. **二进制文件加载失败**
   - 运行 `npm rebuild`
   - 检查 Node.js 版本兼容性
   - 确认构建工具链完整

3. **性能问题**
   - 使用批量发送
   - 调整缓冲区大小
   - 监控内存使用

### 调试模式

```bash
# 启用调试模式
DEBUG=zmq-logger-client npm start

# 查看详细日志
RUST_LOG=debug node your-app.js
```

## 贡献

欢迎提交问题和改进建议！

## 许可证

MIT License