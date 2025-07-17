# Pingora-Proxy 安全与可观测性实现说明

> 日期：2025-07-08

## 1. 功能概览

| 维度            | 实现要点                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安全 Header     | 自动注入 `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Content-Security-Policy: default-src 'self'`，有效降低 XSS / Clickjacking 风险 |
| 限流            | 默认按 **单 IP 每 60 秒 ≤120 请求** 滑动窗口计数，超限返回 **429 Too Many Requests** 并带 `Retry-After: 60`                                          |
| Prometheus 指标 | 基于 Pingora 模块的 Collector，暴露黄金信号指标：延迟 P50/P95/P99、QPS、错误率、活跃连接数等                                                         |
| 日志            | 支持 CLI `--structured-logs` 或环境变量 `PINGORA_STRUCTURED_LOGS=true` 输出 JSON；兼容纯文本                                                         |
| 配置热加载      | 通过 `notify` 监听 YAML 变更，自动触发优雅重启（下一步将替换为 ArcSwap 在线替换）                                                                    |

---

## 2. 配置示例

```yaml
server:
  listen_address: 0.0.0.0
  listen_port: 8080
  graceful_shutdown: true
  graceful_timeout_seconds: 30

upstreams:
  - name: api-backend
    host: 127.0.0.1
    port: 3000
    path_prefix: /api
    scheme: http # http 或 https
    weight: 2 # 权重

security:
  rate_limit_enabled: true
  max_requests_per_minute: 120

tls:
  enabled: false

performance:
  zero_copy_enabled: true
```

### 字段说明

| 字段                               | 说明                                         |
| ---------------------------------- | -------------------------------------------- |
| `security.rate_limit_enabled`      | 是否启用限流逻辑                             |
| `security.max_requests_per_minute` | 单 IP 每分钟最大请求数                       |
| `upstreams[].scheme`               | `http` / `https`，决定与上游通信是否启用 TLS |
| `upstreams[].weight`               | 权重值，整数，影响 Round-Robin 选择概率      |

---

## 3. Prometheus 指标列表（部分）

| 指标                                      | 类型      | 说明                     |
| ----------------------------------------- | --------- | ------------------------ |
| `pingora_request_duration_seconds_bucket` | Histogram | 请求延迟分桶             |
| `pingora_latency_p50_ms`                  | Gauge     | 最近窗口 P50 延迟 (ms)   |
| `pingora_qps`                             | Gauge     | 当前 QPS                 |
| `pingora_error_rate`                      | Gauge     | 错误率 0-1               |
| `pingora_requests_total`                  | Counter   | 请求总数 (method/status) |
| `pingora_errors_total`                    | Counter   | 错误总数 (method/type)   |
| `pingora_active_connections`              | Gauge     | 活跃连接数               |

可通过以下命令拉取指标：

```bash
curl http://127.0.0.1:8080/metrics
```

---

## 4. 未来改进方向

1. **ArcSwap 在线热替换**：替代当前 SIGINT 重启方案，实现无连接中断的配置更新。
2. **自定义安全 Header**：将 Header 列表暴露为可配置项，满足差异化需求。
3. **OpenTelemetry**：增加 OTLP 导出器，与链路追踪平台整合。
4. **限流算法**：从滑动窗口升级为 Token Bucket 或 Rate Limiter 插件化。

---

## 5. 参考

- Pingora 官方文档：https://github.com/cloudflare/pingora
- Prometheus Monitoring Best Practices
