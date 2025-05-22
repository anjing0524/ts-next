// wasm-cal/src/utils/formatters.rs
use crate::layout::theme::*; // For format strings and thresholds

/// Formats a price value based on its magnitude.
/// Uses constants from theme.rs for thresholds and format strings.
pub fn format_price_dynamic(value: f64) -> String {
    if value.abs() >= PRICE_FORMAT_THRESHOLD_NO_DECIMAL {
        format!(FORMAT_PRICE_NO_DECIMAL, value)
    } else if value.abs() >= PRICE_FORMAT_THRESHOLD_DEFAULT {
        format!(FORMAT_PRICE_DEFAULT, value)
    } else {
        // For values less than PRICE_FORMAT_THRESHOLD_DEFAULT (e.g., < 1.0)
        // and not meeting OVERLAY_MIN_PRICE_DISPLAY_THRESHOLD for zero check.
        // This branch typically implies high precision for small non-zero values.
        format!(FORMAT_PRICE_HIGH_PRECISION, value)
    }
}

/// Formats a price value. If its absolute value is less than a given threshold,
/// it returns "0"; otherwise, it formats it using the default price format.
pub fn format_price_with_zero_threshold(value: f64, zero_display_threshold: f64) -> String {
    if value.abs() < zero_display_threshold {
        "0".to_string() // Literal "0" string
    } else {
        format!(FORMAT_PRICE_DEFAULT, value)
    }
}
