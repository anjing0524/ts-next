# Pingora 代理监控

## 简介

本监控系统专注于黄金信号监控，提供轻量级的性能观测功能。

## 黄金信号

### 1. 延迟 (Latency)
- **指标**: `pingora_request_duration_seconds`
- **说明**: 请求响应时间分布
- **分位数**: P50, P95, P99

### 2. 流量 (Traffic)
- **指标**: `pingora_requests_total`
- **说明**: 每秒请求数 (QPS)
- **维度**: method, status

### 3. 错误率 (Error Rate)
- **指标**: `pingora_errors_total`
- **说明**: 客户端错误 (4xx) 和服务器错误 (5xx)
- **维度**: method, type

### 4. 饱和度 (Saturation)
- **指标**: `pingora_active_connections`
- **说明**: 活跃连接数

## 快速开始

### 1. 启动代理服务
```bash
cargo run --bin pingora-proxy
```

### 2. 查看指标
```bash
curl http://localhost:9000/metrics
```

### 3. 集成 Prometheus
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'pingora-proxy'
    static_configs:
      - targets: ['localhost:9000']
```

## 配置说明

### 监控配置
```yaml
# config/default.yaml
monitoring:
  enabled: true
  golden_signals:
    window_size: 60  # 监控窗口大小（秒）
    enabled: true
```

### 指标端点
- **HTTP**: `http://localhost:9000/metrics`
- **健康检查**: `http://localhost:9001/health`

## 性能说明

- **开销**: < 1% CPU，< 10MB 内存
- **延迟**: < 1ms 监控记录时间
- **存储**: 内存中保存最近 1000 个延迟样本

## 最佳实践

1. **监控窗口**: 建议设置为 60 秒，平衡精度和性能
2. **告警阈值**: 
   - P99 延迟 > 1000ms
   - 错误率 > 5%
   - 活跃连接 > 10000
3. **数据保留**: Prometheus 建议保留 7-30 天数据

## 故障排查

### 指标不更新
1. 检查监控是否启用
2. 确认有流量通过代理
3. 检查 `/metrics` 端点是否可访问

### 延迟异常
1. 查看 P95/P99 延迟趋势
2. 检查上游服务状态
3. 确认网络连接稳定

### 错误率过高
1. 检查 4xx vs 5xx 错误比例
2. 查看具体错误类型
3. 确认上游服务健康状态

## 扩展监控

如需更复杂的监控功能，建议：

1. 使用 Prometheus + Grafana 完整监控栈
2. 集成分布式追踪 (Jaeger/Zipkin)
3. 添加业务指标监控
4. 使用 APM 工具 (New Relic, Datadog) 