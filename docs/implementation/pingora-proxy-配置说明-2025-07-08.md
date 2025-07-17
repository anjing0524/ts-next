# Pingora Proxy 配置说明

> **文档日期：2025-07-09**
>
> **注意：** 此文档描述的是重构后的新版配置结构。

本文档详细说明了 `pingora-proxy` 的 YAML 配置文件格式，该格式在重构后变得更加强大和灵活。

## 1. 核心理念

新的配置模型将路由的 **匹配规则** (`routes`) 与 **上游服务定义** (`upstream_groups`) 解耦。

- **`routes`**: 定义了“什么样的请求”应该被处理。每个路由包含一组匹配器（`matchers`），可以根据请求的路径、主机名、方法或头部来识别请求。
- **`upstream_groups`**: 定义了请求应该“被发往哪里”。每个组包含一个或多个后端服务器，并配置了负载均衡策略和健康检查。
- **`middleware`**: 在路由层面配置，允许在请求被转发到上游之前或之后执行特定操作，例如 JWT 验证或缓存。

## 2. 顶级配置结构

```yaml
# 服务器全局设置
server: { ... }

# 路由规则列表
routes:
  - { ... }
  - { ... }

# 上游服务组列表
upstream_groups:
  - { ... }
  - { ... }

# TLS (HTTPS) 配置
tls: { ... }

# 性能优化配置
performance: { ... }

# 安全相关配置
security: { ... }
```

## 3. 配置字段详解

### 3.1 `server`

| 字段                       | 类型   | 默认值    | 说明                            |
| -------------------------- | ------ | --------- | ------------------------------- |
| `listen_address`           | string | `0.0.0.0` | 代理监听的 IP 地址。            |
| `listen_port`              | int    | `8080`    | 代理监听的 HTTP 端口。          |
| `health_check_port`        | int    | `9080`    | 健康检查服务的专用端口。        |
| `metrics_port`             | int    | `9081`    | Prometheus 指标服务的专用端口。 |
| `worker_threads`           | int    | `4`       | 工作线程数。                    |
| `graceful_shutdown`        | bool   | `true`    | 是否启用优雅停机。              |
| `graceful_timeout_seconds` | int    | `30`      | 优雅停机等待的超时时间。        |

### 3.2 `routes`

`routes` 是一个列表，定义了所有路由规则。请求将按列表顺序进行匹配，第一个完全匹配所有 `matchers` 的路由将被选中。

```yaml
routes:
  - name: 'api_route' # 路由的唯一名称
    matchers: # 匹配器列表，请求必须满足所有匹配器
      - path_prefix: '/api' # 匹配以 /api 开头的路径
      - host: 'api.example.com' # 匹配 Host 请求头
    upstream_group: 'api_backend' # 匹配成功后，将请求发往名为 "api_backend" 的上游组
    middleware: { ... } # 为此路由配置中间件
```

#### `matchers`

| 匹配器        | 值类型             | 说明                                                           |
| ------------- | ------------------ | -------------------------------------------------------------- |
| `path_prefix` | string             | 匹配请求 URL 路径的前缀。                                      |
| `host`        | string             | 匹配请求的 `Host` 头部。                                       |
| `method`      | string             | 匹配 HTTP 请求方法 (e.g., `GET`, `POST`)。                     |
| `header`      | `[string, string]` | 匹配特定的请求头及其值，格式为 `[header_name, header_value]`。 |

### 3.3 `upstream_groups`

`upstream_groups` 是一个列表，定义了所有可用的上游服务集群。

```yaml
upstream_groups:
  - name: 'api_backend' # 上游组的唯一名称
    backends: # 后端服务器列表
      - host: '127.0.0.1' # 后端主机
        port: 3001 # 后端端口
        weight: 1 # 负载均衡权重
    load_balancing: # 负载均衡配置
      round_robin: {} # 使用轮询算法
      # hash: "X-User-ID"           # 或使用基于请求头的哈希算法
    health_check_path: '/health' # 健康检查的路径
    timeout_seconds: 15 # 请求超时时间
    use_tls: false # 连接后端时是否使用 TLS
```

### 3.4 `middleware`

中间件在路由级别进行配置。

#### JWT 验证

```yaml
middleware:
  jwt:
    jwks_url: 'https://your-auth-provider.com/.well-known/jwks.json' # JWKS 端点
    issuer: 'https://your-auth-provider.com/' # 预期的 iss 声明
    audience: 'your-api-audience' # 预期的 aud 声明
```

#### 缓存

```yaml
middleware:
  cache:
    ttl_seconds: 60 # 响应的缓存时间（秒）
```

> **注意**: 当前实现中，缓存写入功能受限于框架，只能缓存响应头。

## 4. 运行代理

使用以下命令启动代理，并通过 `-c` 参数指定配置文件：

```bash
./target/release/pingora-proxy -c config/default.yaml
```

要使其在后台运行，请使用 `-d` (daemon) 标志：

```bash
./target/release/pingora-proxy -c config/default.yaml -d
```
