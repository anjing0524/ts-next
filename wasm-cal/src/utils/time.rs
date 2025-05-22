// wasm-cal/src/utils/time.rs
use chrono::DateTime;

// Define local constants for volume thresholds
const KILO_THRESHOLD: f64 = 1_000.0;
const MILLION_THRESHOLD: f64 = 1_000_000.0;
const BILLION_THRESHOLD: f64 = 1_000_000_000.0;

/// 格式化成交量
pub fn format_volume(volume: f64, precision: usize) -> String {
    match volume {
        v if v >= BILLION_THRESHOLD => format!(
            "{:.precision$}B", // Suffix B, M, K are part of the format
            v / BILLION_THRESHOLD,
            precision = precision
        ),
        v if v >= MILLION_THRESHOLD => format!("{:.precision$}M", v / MILLION_THRESHOLD, precision = precision),
        v if v >= KILO_THRESHOLD => format!("{:.precision$}K", v / KILO_THRESHOLD, precision = precision),
        v => format!("{:.precision$}", v, precision = precision),
    }
}

/// 格式化Unix时间戳
pub fn format_timestamp(timestamp_secs: i64, format_str: &str) -> String {
    let dt = DateTime::from_timestamp(timestamp_secs, 0)
        .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap()); // Fallback for invalid timestamp
    dt.format(format_str).to_string()
}
