# Rust核心模块结构

src/
├── lib.rs                     # 库入口，导出公共API
├── main.rs                    # 二进制入口
├── bin/
│   └── log_client.rs         # 测试用的日志客户端
├── config/                   # 配置管理模块
│   ├── mod.rs
│   ├── config.rs            # 配置结构体
│   └── loader.rs            # 配置加载器
├── zmq/                      # ZMQ网络模块
│   ├── mod.rs
│   ├── server.rs            # ZMQ服务器实现
│   ├── client.rs            # ZMQ客户端实现
│   └── protocol.rs          # ZMQ协议定义
├── storage/                  # 存储模块
│   ├── mod.rs
│   ├── file_writer.rs       # 异步文件写入器
│   ├── rotation.rs          # 日志轮转
│   ├── compression.rs       # 压缩管理
│   └── indexer.rs           # 日志索引
├── processor/                # 日志处理模块
│   ├── mod.rs
│   ├── processor.rs         # 日志处理器
│   ├── formatter.rs         # 日志格式化
│   ├── validator.rs         # 日志验证
│   └── batcher.rs           # 批量处理器
├── metrics/                  # 监控指标模块
│   ├── mod.rs
│   ├── collector.rs         # 指标收集器
│   ├── prometheus.rs        # Prometheus导出
│   └── stats.rs             # 统计信息
├── http/                     # HTTP API模块
│   ├── mod.rs
│   ├── server.rs            # HTTP服务器
│   ├── routes.rs            # 路由定义
│   └── middleware.rs        # 中间件
├── utils/                    # 工具模块
│   ├── mod.rs
│   ├── error.rs             # 错误定义
│   ├── time.rs              # 时间工具
│   ├── crypto.rs            # 加密工具
│   └── buffer.rs            # 缓冲区管理
├── types/                    # 类型定义
│   ├── mod.rs
│   ├── log_entry.rs         # 日志条目
│   ├── log_level.rs         # 日志级别
│   └── result.rs            # 结果类型
└── napi/                     # Node.js绑定
    ├── mod.rs
    ├── logger.rs            # Logger绑定
    ├── client.rs            # 客户端绑定
    └── types.rs             # 类型绑定

# Node.js绑定结构

bindings/
├── src/
│   ├── index.ts             # 主入口
│   ├── logger.ts            # Logger类
│   ├── client.ts            # 客户端类
│   ├── types.ts             # 类型定义
│   └── utils.ts             # 工具函数
├── scripts/
│   └── post-build.js        # 构建后处理
├── tests/
│   ├── logger.test.ts       # Logger测试
│   └── client.test.ts       # 客户端测试
├── examples/
│   ├── basic-usage.ts       # 基本使用示例
│   └── advanced-usage.ts    # 高级使用示例
└── package.json

# 配置文件结构

config/
├── default.yaml            # 默认配置
├── development.yaml        # 开发环境配置
├── production.yaml         # 生产环境配置
└── testing.yaml           # 测试环境配置

# 文档结构

docs/
├── API.md                  # API文档
├── CONFIGURATION.md        # 配置文档
├── PERFORMANCE.md          # 性能优化指南
├── DEPLOYMENT.md           # 部署指南
└── EXAMPLES.md             # 使用示例