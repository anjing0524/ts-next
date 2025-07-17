# Pingora 高性能反向代理 - V2 设计文档

本文档描述了一个基于 [Pingora](https://github.com/cloudflare/pingora) 框架构建的高性能、可扩展、易于管理的反向代理的设计方案。该方案在现有实现的基础上，增加了动态配置、高级路由、增强的可观测性和更高的灵活性。

## 1. 核心特性 (Core Features)

- **高性能与低延迟**: 继承 Pingora 框架的 Rust 原生性能和异步 I/O 模型。
- **多服务与多路由**: 支持在单一实例中运行多个代理服务，并根据主机名（Host）和路径（Path）进行精细化路由。
- **动态配置**: 支持配置热重载，无需重启服务即可应用变更（如增删上游节点）。
- **多种负载均衡策略**: 支持轮询（Round Robin）、随机（Random）和基于哈希（Hashing）的负载均衡策略，且可为每个上游组独立配置。
- **主动健康检查**: 对上游节点进行主动 TCP 或 HTTP 健康检查，自动隔离故障节点。
- **丰富的可观测性**:
  - **结构化日志 (JSON)**: 包含请求ID，便于日志聚合与分布式追踪。
  - **Prometheus 指标**: 暴露详细的性能和状态指标。
- **安全**: 支持 TLS 终止，集中管理证书。
- **易于扩展**: 模块化设计，易于添加自定义中间件或负载均衡算法。

## 2. 架构概览 (Architecture Overview)

代理服务由一个主 Server 进程和多个 Worker 线程构成。主进程负责监听端口、加载配置和分发请求。每个 Worker 线程独立处理客户端连接和向上游的转发逻辑。

```
                                     ┌──────────────────────────────┐
                                     │   Configuration (YAML File)  │
                                     └──────────────┬───────────────┘
                                                    │ (Hot Reload)
                                                    ▼
┌──────────────────┐         ┌──────────────────────────────────────────┐
│ Incoming Traffic │───────► │           Pingora Proxy Service          │
│ (HTTP/HTTPS)     │         │         (Binds to 0.0.0.0:8000)          │
└──────────────────┘         ├──────────────────────────────────────────┤
                             │ 1. Routing Logic (Host/Path Based)       │
                             │ 2. Middleware (Logging, Headers, Auth)   │
                             │ 3. TLS Termination                       │
                             └──────────────────┬───────────────────────┘
                                                │
           ┌────────────────────────────────────┼───────────────────────────────────┐
           │                                    │                                   │
           ▼                                    ▼                                   ▼
┌──────────────────────┐             ┌──────────────────────┐             ┌──────────────────────┐
│   Upstream Group A   │             │   Upstream Group B   │             │   Upstream Group C   │
│ (e.g., /api/users)   │             │ (e.g., /api/orders)  │             │ (e.g., *.example.com)│
├──────────────────────┤             ├──────────────────────┤             ├──────────────────────┤
│ Load Balancer        │             │ Load Balancer        │             │ Load Balancer        │
│ (Round Robin)        │             │ (Hashing)            │             │ (Random)             │
│ w/ Health Checks     │             │ w/ Health Checks     │             │ w/ Health Checks     │
└─────────┬────────────┘             └─────────┬────────────┘             └─────────┬────────────┘
          │                                    │                                    │
    ┌─────┴─────┐                        ┌─────┴─────┐                        ┌─────┴─────┐
    ▼           ▼                        ▼           ▼                        ▼           ▼
┌───────┐   ┌───────┐                ┌───────┐   ┌───────┐                ┌───────┐   ┌───────┐
│Svc A.1│   │Svc A.2│                │Svc B.1│   │Svc B.2│                │Svc C.1│   │Svc C.2│
└───────┘   └───────┘                └───────┘   └───────┘                └───────┘   └───────┘
```

## 3. 设计与实现 (Design & Implementation)

### 3.1. 配置文件 (`config.yaml`)

配置文件将进行扩展，以支持更丰富的功能。

```yaml
# 全局设置
server:
  worker_threads: 8
  log_level: 'info'
  log_format: 'json' # "text" or "json"

# 管理 API
admin:
  bind_address: '127.0.0.1:6190'
  enabled: true

# Prometheus 指标
metrics:
  bind_address: '127.0.0.1:9090'
  enabled: true

# 代理服务列表
services:
  - name: 'api-gateway'
    bind_address: '0.0.0.0:8000'
    tls:
      enabled: true
      cert_path: '/path/to/cert.pem'
      key_path: '/path/to/key.pem'

    # 路由规则，按顺序匹配
    routes:
      # 规则1: 基于路径路由到用户服务
      - name: 'users-service-route'
        path_prefix: '/api/v1/users'
        # 要移除的前缀，转发给上游时，/api/v1/users/123 -> /123
        strip_prefix: '/api/v1/users'
        upstreams:
          - name: 'users-service'
            lb_strategy: 'round_robin' # round_robin, random, hash
            hash_on: 'client_ip' # for hash strategy
            health_check:
              schema: 'tcp' # "tcp" or "http"
              http_path: '/health' # for http check
              frequency_secs: 5
            nodes:
              - addr: '10.0.1.1:8080'
                sni: 'users.internal' # 覆盖 SNI
              - addr: '10.0.1.2:8080'

      # 规则2: 基于主机名路由到网站
      - name: 'website-route'
        host: 'www.example.com'
        upstreams:
          - name: 'website-service'
            lb_strategy: 'random'
            nodes:
              - addr: '10.0.2.1:3000'
```

### 3.2. 核心逻辑 (`src/proxy/mod.rs`)

`ProxyHttp` 的实现将变得更加智能。

1.  **上下文 `CTX`**: `CTX` 将包含 `request_id` 和匹配到的路由规则信息。
2.  **路由匹配**: `upstream_peer` 方法首先会遍历配置中的 `routes` 列表。
3.  **动态选择 `LoadBalancer`**: 根据匹配到的路由规则，从一个全局的、可通过 `Arc<Mutex<HashMap<...>>>` 管理的 `LoadBalancer` 池中获取对应的实例。
4.  **请求头处理**: 在将请求转发到上游之前，根据路由规则（如 `strip_prefix`）修改请求 URI，并添加 `X-Request-ID` 等追踪头。

### 3.3. 配置热重载

- 一个后台 `tokio` 任务会定期（例如每5秒）检查配置文件的修改时间。
- 当检测到文件变更时，会安全地执行以下操作：
  1.  解析新的配置文件。
  2.  与当前配置进行比对，找出新增、修改和删除的服务/路由/上游。
  3.  为新增或修改的部分创建新的 `LoadBalancer` 实例。
  4.  原子性地（通过 `ArcSwap` 或类似机制）替换正在使用的 `LoadBalancer` 引用。
  5.  平滑地移除不再使用的服务，等待现有连接处理完毕。

## 4. 未来规划 (Future Roadmap)

- [ ] **中间件支持**: 实现一个简单的中间件链，允许在请求处理流程中插入自定义逻辑（如认证、速率限制）。
- [ ] **A/B 测试与金丝雀发布**: 增加根据权重或请求头将部分流量转发到不同版本上游的功能。
- [ ] **WebSockets 支持**: 完善对 WebSocket 协议的代理支持。
- [ ] **gRPC 代理**: 增加对 gRPC 流量的代理和负载均衡能力。
