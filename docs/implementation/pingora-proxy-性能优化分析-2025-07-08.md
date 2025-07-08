# Pingora Proxy 性能优化分析

> 文档日期：2025-07-08

## 1. 背景

Pingora Proxy 作为本项目在 Layer 7 提供 HTTP 反向代理与负载均衡能力的核心组件，目前已具备基础的路由、负载均衡（Round-Robin）、健康检查与指标采集功能。但在近期压测中暴露：

1. **路由错误**：当存在多个 `path_prefix` 时，代理层未按前缀匹配导致请求被转发到错误上游。
2. **配置冗余**：`config/default.yaml` 与 `config/proxy.yaml` 字段大量重复，容易造成版本漂移。
3. **可 observability 性不足**：指标和日志散落在 `metrics` 与 `service.rs`，难以扩展。

## 2. 现状分析

| 维度 | 观察结果 |
| --- | --- |
| 上游选择 | 全局 `LoadBalancer<RoundRobin>`，忽略 `path_prefix`，存在路由冲突风险 |
| 配置管理 | 两份 YAML 定义结构不一致；`proxy.yaml` 额外引入 `routing`/`auth` 等字段，但代码未消费 |
| 指标采集 | 仅记录请求耗时与状态码；无 QPS、后端错误率、HC 状态等关键指标 |
| 性能功能 | 零拷贝、压缩等开关可调，但缺少动态热更新能力 |

## 3. 待优化问题

1. **路径前缀感知的上游选择**  
   - 按最长匹配策略分组请求 ➜ 组内 Round-Robin ➜ 默认回退。
2. **配置文件统一**  
   - 以 `default.yaml` 为唯一真实配置，`sample-proxy.yaml` 仅作示例；新增字段通过版本化管控。  
   - 引入 schema 校验，CI 检测字段漂移。
3. **指标与日志模块化**  
   - 独立 `metrics` 子模块暴露 Prometheus 指标：连接池使用率、HC 结果、后端 RTT 等。
4. **健康检查与熔断增强**（可选）  
   - 基于现有 `TcpHealthCheck`，支持 HTTP 主动探测与熔断逻辑。

## 4. 优化方案

### 4.1 路由与负载均衡

```rust
// 伪代码
// HashMap<path_prefix, LoadBalancer<RoundRobin>>
let mut lb_map = HashMap::new();
for upstream in settings.upstreams {
    lb_map.entry(upstream.path_prefix.clone())
        .or_insert_with(|| LoadBalancer::new())
        .add_backend(upstream.to_peer());
}
```

1. 在 `ProxyService::new()` 构建 `lb_map`，按路径前缀降序排序。
2. `select_upstream(path)` 返回 `(UpstreamConfig, &LoadBalancer)`，精确至路径组。
3. 回退逻辑：若无匹配，使用 `"/"` 默认组或 502。

### 4.2 配置文件统一

1. 删除 `proxy.yaml` 冗余字段或改名为 `sample-proxy.yaml`。  
2. 在 `settings.rs` 增加可选字段（如熔断器配置），保持向后兼容。  
3. 在 CI 添加 `cargo deny` + `schemars` 生成 JSON-Schema，确保 YAML 校验。

### 4.3 指标与日志模块化

1. 抽离 `metrics` 为独立 crate/workspace package，使用 `prometheus_client`。  
2. `ProxyService` 仅调用 `metrics::record_*`，解耦业务逻辑。  
3. 日志增加 TraceID、上游延时、重试次数等字段。

## 5. 预期收益

| 优化点 | 预期效果 |
| --- | --- |
| 路由精准 | 静态资源与 API 分流，无错发；吞吐 ↑3-5% |
| 配置统一 | 减少人为误配；CI 静态校验 → 部署失败率 ↓ |
| 指标增强 | 快速定位后端性能瓶颈；支撑自动扩容 |

## 6. 风险与回滚

- **HashMap 路由逻辑 Bug**：提供回滚开关 `route_by_prefix`，出问题时切回全局 LB。  
- **配置向后兼容**：保留旧字段解析但打 `deprecated` 警告。

## 7. 结论

通过以上优化，Pingora Proxy 将获得更精准的流量路由、简洁一致的配置管理及完善的可观测性，为后续高并发场景打下基础。下一步将依赖本文档执行代码改造与测试覆盖。 