# @repo/cache - 缓存库技术文档

## 包介绍

`@repo/cache` 是一个通用的缓存库，为整个项目提供统一的缓存抽象层。支持Redis分布式缓存和LRU内存缓存的自动切换，适配不同的运行环境（Node.js vs Edge Runtime）。

## 核心功能

- **双缓存策略**: 自动选择Redis或LRU内存缓存
- **环境适配**: 在Edge Runtime下自动降级为LRU缓存
- **统一接口**: 提供一致的缓存操作API
- **连接管理**: 自动处理Redis连接和重连
- **错误处理**: 优雅的降级机制，Redis故障时自动切换到LRU

## 技术架构

### 缓存实现

| 实现类 | 用途 | 特点 |
|--------|------|------|
| `RedisCache` | 分布式缓存 | 支持持久化、集群、高并发 |
| `LRUCacheAdapter` | 内存缓存 | 轻量级、无依赖、Edge Runtime兼容 |

### 缓存管理器

- **单例模式**: 全局唯一的缓存管理器实例
- **延迟初始化**: 首次使用时才创建连接
- **故障转移**: Redis连接失败时自动降级到LRU
- **资源清理**: 提供优雅的关闭方法

## API 参考

### 基础接口

```typescript
interface CacheInterface {
  get<T = any>(key: string): Promise<T | null>
  set(key: string, value: any, ttl?: number): Promise<void>
  del(key: string): Promise<void>
  clear(): Promise<void>
  exists(key: string): Promise<boolean>
}
```

### 便捷导出

```typescript
import { 
  cacheManager,      // 单例实例
  cache,             // 缓存接口
  getCacheValue,     // 获取值
  setCacheValue,     // 设置值
  deleteCacheValue,  // 删除值
  clearCache,        // 清空缓存
  cacheExists        // 检查存在
} from '@repo/cache'
```

## 使用示例

### 基础使用

```typescript
import { cache } from '@repo/cache'

// 设置缓存
await cache.set('user:123', { name: '张三', age: 25 }, 3600)

// 获取缓存
const user = await cache.get('user:123')

// 删除缓存
await cache.del('user:123')

// 检查存在
const exists = await cache.exists('user:123')
```

### 类型安全使用

```typescript
interface User {
  id: string
  name: string
  email: string
}

const user = await getCacheValue<User>('user:123')
if (user) {
  console.log(user.name) // 类型安全
}
```

### 高级配置

```typescript
import { CacheManager } from '@repo/cache'

// 获取管理器实例
const manager = CacheManager.getInstance()

// 检查当前使用的缓存类型
const isRedis = manager.isUsingRedis()

// 获取Redis客户端（如果可用）
const redisClient = manager.getRedisClient()

// 关闭连接
await manager.close()
```

## 环境配置

### 环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `REDIS_URL` | Redis连接字符串 | `redis://localhost:6379` |
| `NEXT_RUNTIME` | Next.js运行环境 | `nodejs` 或 `edge` |

### 缓存配置

**Redis模式**（有REDIS_URL时）：
- 支持集群和哨兵模式
- 自动重连机制
- 连接池管理

**LRU模式**（默认）：
- 最大容量：1000项
- 默认TTL：3600秒（1小时）
- 内存占用：最小化

## 运行环境适配

### Node.js环境
- 自动尝试连接Redis
- Redis连接失败时降级到LRU
- 支持完整的Redis功能

### Edge Runtime环境
- 强制使用LRU缓存
- 避免Redis依赖
- 适合Vercel Edge Functions

## 最佳实践

### 键命名规范

```typescript
// 使用冒号分隔的层次结构
const key = `user:${userId}:profile`
const key2 = `api:${endpoint}:v1:${hash}`

// 避免特殊字符
const safeKey = key.replace(/[^a-zA-Z0-9:._-]/g, '_')
```

### TTL设置

```typescript
// 短期缓存：API响应
await cache.set('api:response', data, 300) // 5分钟

// 中期缓存：用户数据
await cache.set('user:profile', profile, 3600) // 1小时

// 长期缓存：配置数据
await cache.set('app:config', config, 86400) // 24小时
```

### 错误处理

```typescript
try {
  const value = await cache.get('some-key')
  if (value === null) {
    // 缓存未命中，从数据库获取
    const freshData = await fetchFromDatabase()
    await cache.set('some-key', freshData, 300)
    return freshData
  }
  return value
} catch (error) {
  // 缓存错误不影响主流程
  console.error('Cache error:', error)
  return await fetchFromDatabase()
}
```

## 调试与监控

### 日志输出

缓存库会输出以下日志：
- `[CACHE-INFO]`: 常规操作信息
- `[CACHE-ERROR]`: 错误信息
- `[CACHE-WARN]`: 警告信息

### 性能监控

```typescript
// 监控缓存命中率
const start = Date.now()
const result = await cache.get('key')
const hit = result !== null
console.log(`Cache ${hit ? 'hit' : 'miss'} in ${Date.now() - start}ms`)
```

## 开发指南

### 安装依赖

```bash
pnpm install
```

### 代码检查

```bash
pnpm lint
```

### 代码格式化

```bash
pnpm format
```

### 测试

```typescript
// 在测试环境中使用
process.env.REDIS_URL = '' // 强制使用LRU缓存
const { cache } = require('@repo/cache')

// 测试后清理
afterAll(async () => {
  await cache.clear()
})
```

## 故障排除

### 常见问题

**Redis连接失败**
- 检查REDIS_URL是否正确
- 确认Redis服务是否运行
- 查看网络连接和防火墙设置

**内存使用过高**
- LRU缓存最大容量为1000项
- 检查是否有大对象被缓存
- 考虑减少TTL时间

**Edge Runtime错误**
- 确保不直接导入ioredis
- 避免使用Node.js特定API

### 调试模式

```typescript
// 启用详细日志
DEBUG=* node your-app.js

// 检查当前缓存状态
console.log('Using Redis:', manager.isUsingRedis())
console.log('Redis client:', manager.getRedisClient())
```

## 相关链接

- [ioredis文档](https://github.com/luin/ioredis)
- [lru-cache文档](https://github.com/isaacs/node-lru-cache)
- [项目主文档](../../CLAUDE.md)