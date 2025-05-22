// wasm-cal/src/utils/formatters.rs
use crate::layout::theme::*; // For format strings and thresholds

/// Formats a price value based on its magnitude.
/// Uses constants from theme.rs for thresholds and format strings.
pub fn format_price_dynamic(value: f64) -> String {
    if value.abs() >= PRICE_FORMAT_THRESHOLD_NO_DECIMAL {
        format!("{:.0}", value)
    } else if value.abs() >= PRICE_FORMAT_THRESHOLD_DEFAULT {
        format!("{:.2}", value)
    } else {
        format!("{:.4}", value)
    }
}

/// Formats a price value. If its absolute value is less than a given threshold,
/// it returns "0"; otherwise, it formats it using the default price format.
pub fn format_price_with_zero_threshold(value: f64, zero_display_threshold: f64) -> String {
    if value.abs() < zero_display_threshold {
        "0".to_string()
    } else {
        format!("{:.2}", value)
    }
}
