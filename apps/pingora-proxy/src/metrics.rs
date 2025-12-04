/// Prometheus 监控指标 (简化版)
/// 真实环境中应使用完整的 prometheus crate

/// 导出 Prometheus 指标为文本格式
pub fn metrics_text() -> String {
    r#"
# HELP http_requests_total 总 HTTP 请求数
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/",status="200"} 0

# HELP http_request_duration_seconds HTTP 请求延迟（秒）
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005"} 0
http_request_duration_seconds_bucket{le="0.01"} 0
http_request_duration_seconds_bucket{le="+Inf"} 0
http_request_duration_seconds_sum 0
http_request_duration_seconds_count 0

# HELP http_connections_total 总连接数
# TYPE http_connections_total counter
http_connections_total 0

# HELP http_errors_total 总错误数
# TYPE http_errors_total counter
http_errors_total{type="connection_refused"} 0
http_errors_total{type="timeout"} 0

# HELP rate_limit_exceeded_total 超过速率限制的请求数
# TYPE rate_limit_exceeded_total counter
rate_limit_exceeded_total 0
"#
    .to_string()
}
