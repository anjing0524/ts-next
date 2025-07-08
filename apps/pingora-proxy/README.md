# Pingora Proxy - 生产级反向代理服务

基于 Rust Pingora 生态的高性能反向代理服务器，专为生产环境设计，支持 **50,000 RPS** 性能目标。

## 🚀 核心特性

### 高性能架构
- **单节点吞吐量**: ≥ 50,000 RPS
- **低延迟**: P99 < 100ms (内网后端)
- **高并发**: 支持 10,000+ 并发连接
- **内存效率**: 10,000 连接 < 1GB 内存使用

### 完整监控系统
- **黄金信号监控**: 延迟、错误率、流量、饱和度
- **分布式追踪**: X-Request-ID 全链路追踪
- **结构化日志**: JSON 格式，1% 采样率
- **Prometheus 集成**: 完整指标收集

### 安全防护
- **DDoS 防护**: 令牌桶算法速率限制
- **TLS 1.3 终止**: Rustls 高性能 TLS 处理
- **ACME 自动续期**: Let's Encrypt 证书管理
- **攻击防护**: Slowloris、HTTP 攻击防护

### 高可用设计
- **健康检查**: 主动/被动健康检查
- **熔断机制**: 基于错误率的自动节点隔离
- **零宕机部署**: 配置热重载、优雅关闭
- **集群部署**: 跨可用区故障转移

## 📊 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    监听层 (HTTP/1.1/2/3 + WebSocket)              │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│         请求处理引擎 (安全过滤 + 分布式追踪 + 监控指标)               │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│          负载均衡 (加权轮询 + 最少连接 + 熔断机制)                   │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│        TLS 终结 (TLS 1.3 + ACME 自动续期 + OCSP Stapling)         │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│        连接池 (连接复用 > 90% + 健康检查 + 零拷贝优化)               │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 系统要求
- **Rust**: 2024 edition (1.86.0+)
- **OS**: Linux (推荐)、macOS、Windows
- **Memory**: 最少 2GB RAM
- **CPU**: 4+ 核心 (推荐)

### 构建和安装

```bash
# 克隆项目
git clone <repository-url>
cd ts-next-template/apps/pingora-proxy

# 构建发布版本
cargo build --release

# 或使用优化构建 (更高性能)
cargo build --release --target-cpu=native
```

### 配置文件

创建配置文件 `config/production.yaml`:

```yaml
# 服务器配置
server:
  listen_address: "0.0.0.0"
  listen_port: 8080
  worker_threads: 4
  graceful_shutdown: true
  graceful_timeout_seconds: 30

# 性能优化
performance:
  zero_copy_enabled: true
  memory_pool_enabled: true
  connection_pool_size: 1000
  compression_enabled: true
  compression_level: 6

# 监控配置
monitoring:
  prometheus:
    enabled: true
    listen_port: 9090
    metrics_path: "/metrics"
  tracing:
    enabled: true
    sampling_rate: 0.01  # 1% 采样率

# 安全配置
security:
  rate_limit:
    enabled: true
    requests_per_second: 1000
    burst_size: 2000
  ddos_protection:
    enabled: true
    max_connections_per_ip: 100

# TLS 配置
tls:
  enabled: true
  cert_path: "/certs/fullchain.pem"
  key_path: "/certs/privkey.pem"
  http2_enabled: true
  acme:
    enabled: true
    directory_url: "https://acme-v02.api.letsencrypt.org/directory"
    email: "admin@example.com"
    domains: ["example.com"]

# 上游配置
upstreams:
  - name: "backend-api"
    servers:
      - host: "10.0.1.10"
        port: 8080
        weight: 100
        tls: false
    load_balance_strategy: "round_robin"
    health_check:
      enabled: true
      interval_seconds: 5
      path: "/health"
    circuit_breaker:
      enabled: true
      error_threshold: 0.1  # 10%
      timeout_seconds: 60
```

### 启动服务

```bash
# 使用默认配置启动
./target/release/pingora-proxy

# 使用自定义配置启动
./target/release/pingora-proxy config/production.yaml

# 开发模式 (详细日志)
RUST_LOG=debug ./target/release/pingora-proxy
```

## 📈 监控和指标

### 健康检查端点
```bash
# 服务健康状态
curl http://localhost:9080/health

# Kubernetes 风格健康检查
curl http://localhost:9080/healthz
```

### Prometheus 指标
```bash
# 查看所有指标
curl http://localhost:9090/metrics
```

### 核心指标

| 指标名称 | 类型 | 描述 |
|----------|------|------|
| `pingora_requests_total` | Counter | 总请求数 (按方法、路由、状态码) |
| `pingora_request_duration_seconds` | Histogram | 请求延迟分布 (P50/P95/P99) |
| `pingora_connections_active` | Gauge | 当前活跃连接数 |
| `pingora_upstream_health_status` | Gauge | 上游服务健康状态 |
| `pingora_rate_limit_hits_total` | Counter | 速率限制触发次数 |
| `pingora_circuit_breaker_state` | Gauge | 熔断器状态 |

## 🔧 高级配置

### 负载均衡策略

```yaml
upstreams:
  - name: "api-cluster"
    servers:
      - host: "api1.example.com"
        port: 8080
        weight: 100
      - host: "api2.example.com"
        port: 8080
        weight: 80
    load_balance_strategy: "weighted_round_robin"  # 可选: round_robin, least_connections, ip_hash
```

### SSL/TLS 配置

```yaml
tls:
  enabled: true
  # 手动证书配置
  cert_path: "/certs/fullchain.pem"
  key_path: "/certs/privkey.pem"
  
  # ACME 自动证书
  acme:
    enabled: true
    directory_url: "https://acme-v02.api.letsencrypt.org/directory"
    email: "admin@example.com"
    domains: ["example.com", "*.example.com"]
    
  # 高级 TLS 设置
  http2_enabled: true
  http3_enabled: false  # 实验性
  ocsp_stapling: true
  hsts_enabled: true
  hsts_max_age: 31536000
```

### 安全防护配置

```yaml
security:
  # DDoS 防护
  rate_limit:
    enabled: true
    requests_per_second: 1000
    burst_size: 2000
    key_extraction: "client_ip"  # 可选: client_ip, header, custom
    
  # 访问控制
  access_control:
    ip_whitelist: ["192.168.1.0/24", "10.0.0.0/8"]
    ip_blacklist: ["192.168.100.100"]
    geo_blocking:
      enabled: true
      allowed_countries: ["US", "CN", "JP"]
      
  # HTTP 安全
  headers:
    enable_default_headers: true
    custom_headers:
      "X-Frame-Options": "DENY"
      "X-Content-Type-Options": "nosniff"
      "Referrer-Policy": "strict-origin-when-cross-origin"
```

### 缓存配置

```yaml
cache:
  enabled: true
  
  # 内存缓存 (第一层)
  memory:
    max_size: "1GB"
    ttl_seconds: 300
    
  # SSD 缓存 (第二层) - 可选
  disk:
    enabled: false
    path: "/tmp/pingora-cache"
    max_size: "10GB"
    
  # 缓存规则
  rules:
    - path_regex: "\\.(js|css|png|jpg|jpeg|gif|ico|svg)$"
      ttl_seconds: 86400  # 24 小时
      cache_control: "public, max-age=86400"
    - path_regex: "/api/static/"
      ttl_seconds: 3600   # 1 小时
```

## 🧪 测试和验证

### 功能测试

```bash
# 基本连接测试
curl -v http://localhost:8080/

# HTTPS 测试
curl -v https://localhost:8443/

# 健康检查测试
curl http://localhost:9080/health

# 指标测试
curl http://localhost:9090/metrics
```

### 性能测试

```bash
# 使用 wrk 进行压力测试
wrk -t12 -c400 -d30s --latency http://localhost:8080/

# 使用 ab 进行基准测试
ab -n 10000 -c 100 http://localhost:8080/

# 使用 hey 进行负载测试
hey -z 30s -c 50 http://localhost:8080/
```

### 预期性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 吞吐量 | ≥ 50,000 RPS | 单节点性能 |
| 延迟 P99 | < 100ms | 内网后端场景 |
| 内存使用 | < 1GB | 10,000 并发连接 |
| 连接复用率 | > 90% | 后端连接效率 |
| 故障切换时间 | < 3s | 高可用指标 |

## 🔄 运维管理

### 配置热重载

```bash
# 发送 SIGHUP 信号重新加载配置
kill -HUP <pid>

# 或使用系统服务
systemctl reload pingora-proxy
```

### 优雅关闭

```bash
# 发送 SIGTERM 信号优雅关闭
kill -TERM <pid>

# 服务将等待现有连接处理完成后关闭
```

### 日志管理

```bash
# 设置日志级别
export RUST_LOG=info

# 结构化日志输出到文件
./pingora-proxy 2>&1 | tee /var/log/pingora-proxy.log

# 日志轮转 (推荐使用 logrotate)
logrotate /etc/logrotate.d/pingora-proxy
```

### 监控集成

#### Prometheus + Grafana

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'pingora-proxy'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
    metrics_path: '/metrics'
```

#### 告警规则示例

```yaml
# alerts.yml
groups:
  - name: pingora-proxy
    rules:
      - alert: HighErrorRate
        expr: rate(pingora_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          
      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(pingora_request_duration_seconds_bucket[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
```

## 🐛 故障排查

### 常见问题

#### 1. 端口绑定失败
```
Error: Address already in use (os error 98)
```
**解决方案**:
- 检查端口占用: `lsof -i :8080`
- 修改配置文件中的端口号
- 停止占用端口的其他服务

#### 2. 上游连接失败
```
Error: Failed to select upstream
```
**解决方案**:
- 检查上游服务是否运行
- 验证网络连接: `telnet upstream-host upstream-port`
- 检查健康检查配置
- 查看上游服务日志

#### 3. TLS 证书错误
```
Error: TLS configuration incomplete
```
**解决方案**:
- 验证证书文件路径和权限
- 检查证书有效期: `openssl x509 -in cert.pem -text -noout`
- 确认私钥匹配: `openssl x509 -noout -modulus -in cert.pem | openssl md5`

#### 4. 内存使用过高
**解决方案**:
- 调整连接池大小: `connection_pool_size`
- 启用压缩: `compression_enabled: true`
- 优化缓存配置
- 监控内存泄漏

### 调试模式

```bash
# 启用详细日志
RUST_LOG=debug ./pingora-proxy

# 启用跟踪日志
RUST_LOG=trace ./pingora-proxy

# 性能分析
perf record -g ./pingora-proxy
perf report
```

## 📚 开发指南

### 项目结构

```
apps/pingora-proxy/
├── src/
│   ├── main.rs              # 程序入口
│   ├── config/              # 配置管理
│   ├── proxy/               # 代理核心逻辑
│   ├── metrics/             # 监控指标
│   ├── security/            # 安全模块
│   ├── health/              # 健康检查
│   ├── pool/                # 连接池
│   └── utils/               # 工具函数
├── config/                  # 配置文件
├── tests/                   # 测试代码
└── docs/                    # 文档
```

### 编译和测试

```bash
# 编译检查
cargo check

# 运行测试
cargo test

# 代码格式化
cargo fmt

# 代码检查
cargo clippy

# 生成文档
cargo doc --open
```

### 性能调优

```bash
# 使用性能优化标志编译
RUSTFLAGS="-C target-cpu=native" cargo build --release

# 启用 LTO (Link Time Optimization)
cargo build --release --config profile.release.lto=true

# 性能分析
cargo flamegraph --bin pingora-proxy
```

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'Add amazing feature'`
4. 推送到分支: `git push origin feature/amazing-feature`
5. 创建 Pull Request

## 🙏 致谢

- [Pingora](https://github.com/cloudflare/pingora) - 高性能代理框架
- [Tokio](https://tokio.rs/) - 异步运行时
- [Prometheus](https://prometheus.io/) - 监控系统
- [Rustls](https://github.com/rustls/rustls) - TLS 实现

---

**⚡ 生产级性能，企业级可靠性 ⚡**
