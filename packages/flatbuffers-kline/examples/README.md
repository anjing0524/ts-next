# FlatBuffers Schema 编译示例

本目录包含使用原始 FlatBuffers schema 文件的示例。

## 📁 文件说明

- `compile-schema.js` - Schema 编译脚本示例
- `generated/` - 编译输出目录（运行脚本后生成）

## 🚀 使用方法

### 1. 安装 FlatBuffers 编译器

```bash
# macOS
brew install flatbuffers

# Ubuntu/Debian
sudo apt-get install flatbuffers-compiler

# 或从官方下载
# https://github.com/google/flatbuffers/releases
```

### 2. 运行编译脚本

```bash
# 编译为 TypeScript (默认)
node compile-schema.js

# 编译为 Python
node compile-schema.js python

# 编译为 Java
node compile-schema.js java

# 编译为 C++
node compile-schema.js cpp

# 编译为 JavaScript
node compile-schema.js js

# 编译为 Go
node compile-schema.js go

# 编译为 Rust
node compile-schema.js rust
```

### 3. 查看生成的文件

编译完成后，生成的文件将保存在 `generated/` 目录中。

## 📖 Schema 文件位置

Schema 文件位于包的 `schemas/kline.fbs` 路径下：

```javascript
const schemaPath = require.resolve('@repo/flatbuffers-kline/schemas/kline.fbs');
```

## 🔧 自定义编译

您也可以直接使用 `flatc` 命令进行编译：

```bash
# 获取 schema 文件路径
SCHEMA_PATH=$(node -e "console.log(require.resolve('@repo/flatbuffers-kline/schemas/kline.fbs'))")

# 编译为指定语言
flatc --ts -o ./output $SCHEMA_PATH
```

## 📚 更多信息

- [FlatBuffers 官方文档](https://google.github.io/flatbuffers/)
- [FlatBuffers 编译器选项](https://google.github.io/flatbuffers/flatbuffers_guide_using_schema_compiler.html)
- [支持的编程语言](https://google.github.io/flatbuffers/flatbuffers_support.html)