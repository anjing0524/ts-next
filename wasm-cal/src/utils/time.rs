//! 渲染工具模块 - 提供渲染相关的辅助函数

use chrono::DateTime;

/// 格式化成交量
/// * `volume` - 成交量数值
/// * `precision` - 小数位数
/// * 返回格式化后的成交量字符串 (例如 1.23K, 4.56M)
pub fn format_volume(volume: f64, precision: usize) -> String {
    if volume >= 1_000_000_000.0 {
        format!(
            "{:.precision$}B",
            volume / 1_000_000_000.0,
            precision = precision
        )
    } else if volume >= 1_000_000.0 {
        format!(
            "{:.precision$}M",
            volume / 1_000_000.0,
            precision = precision
        )
    } else if volume >= 1_000.0 {
        format!("{:.precision$}K", volume / 1_000.0, precision = precision)
    } else {
        format!("{:.precision$}", volume, precision = precision)
    }
}

/// 格式化Unix时间戳
/// * `timestamp_secs` - Unix时间戳（秒）
/// * `format_str` - 格式化字符串，例如"%Y/%m/%d %H:%M"
/// * 返回格式化后的时间字符串
pub fn format_timestamp(timestamp_secs: i64, format_str: &str) -> String {
    let dt = DateTime::from_timestamp(timestamp_secs, 0)
        .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap());
    dt.format(format_str).to_string()
}
