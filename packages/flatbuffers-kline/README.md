# @repo/flatbuffers-kline

基于 FlatBuffers 的 K线数据类型定义包，提供高性能的数据序列化和反序列化功能。

## 📦 功能特性

- **高性能序列化**: 使用 FlatBuffers 实现零拷贝数据序列化
- **类型安全**: 完整的 TypeScript 类型定义
- **跨平台兼容**: 支持多种编程语言的数据交换
- **内存高效**: 最小化内存占用和 GC 压力

## 🚀 安装

```bash
# 在 monorepo 内部使用
pnpm add @repo/flatbuffers-kline
```

## 🔧 使用原始 Schema 文件

本包同时提供原始的 FlatBuffers schema 文件，您可以根据需要自行编译：

### 获取 Schema 文件

```javascript
// 在 Node.js 中获取 schema 文件路径
const path = require('path');
const schemaPath = require.resolve('@repo/flatbuffers-kline/schemas/kline.fbs');
```

### 自定义编译

```bash
# 安装 FlatBuffers 编译器
brew install flatbuffers  # macOS
# 或从 https://github.com/google/flatbuffers/releases 下载

# 编译为 TypeScript
flatc --ts -o ./generated @repo/flatbuffers-kline/schemas/kline.fbs

# 编译为其他语言
flatc --python -o ./generated @repo/flatbuffers-kline/schemas/kline.fbs
flatc --java -o ./generated @repo/flatbuffers-kline/schemas/kline.fbs
flatc --cpp -o ./generated @repo/flatbuffers-kline/schemas/kline.fbs
```

### 编译示例

查看 `examples/` 目录获取完整的编译示例：

```bash
# 运行编译示例脚本
node node_modules/@repo/flatbuffers-kline/examples/compile-schema.js

# 或指定目标语言
node node_modules/@repo/flatbuffers-kline/examples/compile-schema.js python
```

## 📖 使用方法

### 基本导入

```typescript
import { 
  KlineData, 
  KlineItem, 
  PriceVolume,
  KlineTimeframe,
  MessageType 
} from '@repo/flatbuffers-kline';
```

### 创建 K线数据

```typescript
import { Builder } from 'flatbuffers';
import { KlineData, KlineItem } from '@repo/flatbuffers-kline';

// 创建 FlatBuffers Builder
const builder = new Builder(1024);

// 创建 K线项目
const klineItem = KlineItem.createKlineItem(
  builder,
  Date.now() / 1000, // timestamp
  100.5,  // open
  102.0,  // high
  99.8,   // low
  101.2,  // close
  1000.0, // b_vol
  800.0,  // s_vol
  0,      // volumes (vector)
  101.2,  // last_price
  101.1,  // bid_price
  101.3   // ask_price
);

// 创建 K线数据容器
const items = KlineData.createItemsVector(builder, [klineItem]);
const klineData = KlineData.createKlineData(builder, items, 0.01);

// 完成构建
builder.finish(klineData);

// 获取序列化后的数据
const buffer = builder.asUint8Array();
```

### 解析 K线数据

```typescript
import { ByteBuffer } from 'flatbuffers';
import { KlineData } from '@repo/flatbuffers-kline';

// 从 buffer 解析数据
const buf = new ByteBuffer(buffer);
const klineData = KlineData.getRootAs(buf);

// 访问数据
const itemsLength = klineData.itemsLength();
for (let i = 0; i < itemsLength; i++) {
  const item = klineData.items(i);
  if (item) {
    console.log({
      timestamp: item.timestamp(),
      open: item.open(),
      high: item.high(),
      low: item.low(),
      close: item.close(),
      volume: item.bVol() + item.sVol()
    });
  }
}
```

## 📊 数据结构

### KlineItem

K线单个数据点，包含：

- `timestamp`: 时间戳 (int32)
- `open`: 开盘价 (double)
- `high`: 最高价 (double)
- `low`: 最低价 (double)
- `close`: 收盘价 (double)
- `b_vol`: 买方成交量 (double)
- `s_vol`: 卖方成交量 (double)
- `volumes`: 价格-成交量分布 (PriceVolume[])
- `last_price`: 最新成交价 (double)
- `bid_price`: 买一价 (double)
- `ask_price`: 卖一价 (double)

### PriceVolume

价格-成交量对：

- `price`: 价格 (double)
- `volume`: 成交量 (double)

### KlineData

K线数据容器：

- `items`: K线项目数组 (KlineItem[])
- `tick`: 最小变动价位 (double)

## 🔧 开发

### 构建

```bash
pnpm build
```

### 开发模式

```bash
pnpm dev
```

### 类型检查

```bash
pnpm type-check
```

## 📝 Schema 定义

本包的类型定义基于以下 FlatBuffers schema：

```flatbuffers
namespace Kline;

table PriceVolume{
    price: double;
    volume: double;
}

table KlineItem {
    timestamp: int32;
    open: double;
    high: double;
    low: double;
    close: double;
    b_vol: double;
    s_vol: double;
    volumes: [PriceVolume];
    last_price: double;
    bid_price: double;
    ask_price: double;
}

table KlineData {
    items: [KlineItem];
    tick: double;
}

root_type KlineData;
file_identifier "KLI1";
```

## 🤝 贡献

1. 修改 `schemas/kline.fbs` 文件
2. 重新生成 TypeScript 类型：`flatc --ts -o src schemas/kline.fbs`
3. 更新导出和文档
4. 提交更改

## 📄 许可证

MIT License