// wasm-cal/src/layout/theme.rs

// Formatting Strings
pub const FORMAT_STR_TIME_HM: &str = "%H:%M";
pub const FORMAT_STR_DATE_YMD: &str = "%y/%m/%d";
pub const FORMAT_STR_DATETIME_YMDHM: &str = "%Y-%m-%d %H:%M";
pub const FORMAT_STR_DATETIME_YMDHMS: &str = "%Y-%m-%d %H:%M:%S";
pub const FORMAT_PRICE_DEFAULT: &str = "{:.2}";
pub const FORMAT_PRICE_HIGH_PRECISION: &str = "{:.4}";
pub const FORMAT_PRICE_NO_DECIMAL: &str = "{:.0}";

// Numerical Precision
pub const PRECISION_FACTOR_E8: f64 = 1e8;
pub const VOLUME_FORMAT_PRECISION_DEFAULT: usize = 1;
pub const VOLUME_FORMAT_PRECISION_TOOLTIP: usize = 2;

// Layout Dimensions & Paddings - General
pub const DEFAULT_PADDING: f64 = 8.0;
pub const Y_AXIS_LABEL_X_OFFSET: f64 = 5.0;
pub const Y_AXIS_TICK_X_OFFSET: f64 = 3.0;
pub const TIME_AXIS_LABEL_Y_OFFSET: f64 = 5.0;
pub const TIME_AXIS_SECOND_LINE_Y_OFFSET: f64 = 12.0;

// ChartLayout Default Values (subset for ChartLayout::new())
pub const CL_DEFAULT_HEADER_HEIGHT: f64 = 25.0;
pub const CL_DEFAULT_Y_AXIS_WIDTH: f64 = 60.0;
pub const CL_DEFAULT_NAVIGATOR_HEIGHT: f64 = 40.0;
pub const CL_DEFAULT_PRICE_MARGIN: f64 = 8.0;
pub const CL_DEFAULT_VOLUME_MARGIN: f64 = 2.0;
pub const CL_DEFAULT_TOOLTIP_WIDTH: f64 = 140.0;
pub const CL_DEFAULT_TOOLTIP_HEIGHT: f64 = 100.0;
pub const CL_DEFAULT_TOOLTIP_PADDING: f64 = 6.0;
pub const CL_DEFAULT_TOOLTIP_FADE_DURATION: f64 = 200.0;
pub const CL_DEFAULT_CROSSHAIR_WIDTH: f64 = 1.0;
pub const CL_DEFAULT_GRID_LINE_COUNT: usize = 5;
pub const CL_DEFAULT_TIME_AXIS_HEIGHT: f64 = 30.0;
pub const CL_DEFAULT_NAVIGATOR_HANDLE_WIDTH: f64 = 4.0;
pub const CL_DEFAULT_CANDLE_SPACING: f64 = 1.0;
pub const CL_DEFAULT_CANDLE_WIDTH_INITIAL: f64 = 10.0;
pub const CL_DEFAULT_SWITCH_BTN_HEIGHT: f64 = 16.0;
pub const CL_DEFAULT_SWITCH_BTN_WIDTH: f64 = 60.0;
pub const CL_MAIN_CHART_RATIO: f64 = 0.8; // Main chart part of chart_area_width
pub const CL_BOOK_AREA_RATIO: f64 = 0.2; // Book area part of chart_area_width
pub const CL_KLINE_MODE_VOLUME_RATIO: f64 = 0.2; // Volume part of chart_area_height in K-line mode
pub const CL_HEATMAP_MODE_VOLUME_RATIO: f64 = 0.1; // Volume part of chart_area_height in Heatmap mode
pub const CL_HEATMAP_MODE_THRESHOLD_RATIO: f64 = 0.15; // For is_heatmap_mode check

// AxisRenderer specific
pub const AXIS_FONT_HEIGHT: f64 = 12.0;
pub const AXIS_MIN_X_LABEL_SPACING: f64 = 70.0;
pub const AXIS_MIN_Y_LABEL_DIST_FACTOR: f64 = 0.8;
pub const AXIS_PRICE_TICK_ROUNDING_FACTOR: f64 = 0.5; // e.g. tick * 0.5
pub const AXIS_Y_LABEL_PRICE_ZERO_OFFSET: f64 = 2.0;
pub const AXIS_Y_BANDS_PRICE_CHART: usize = 5;
pub const AXIS_Y_BANDS_VOLUME_CHART: usize = 2;
pub const AXIS_Y_LABELS_VOLUME_CHART: usize = 2;
pub const AXIS_LEGEND_AREA_WIDTH: f64 = 120.0;
pub const AXIS_LEGEND_RECT_Y_OFFSET: f64 = 5.0;
pub const AXIS_LEGEND_RECT_SIZE: f64 = 10.0;
pub const AXIS_LEGEND_TEXT_X_OFFSET_1: f64 = 15.0; // "上涨" text offset
pub const AXIS_LEGEND_TEXT_X_OFFSET_2: f64 = 60.0; // "下跌" rect offset
pub const AXIS_LEGEND_TEXT_X_OFFSET_3: f64 = 75.0; // "下跌" text offset

// PriceRenderer specific
pub const PRICE_MIN_CANDLE_WIDTH: f64 = 1.0;
pub const PRICE_MIN_CANDLE_BODY_HEIGHT: f64 = 1.0;
pub const PRICE_WICK_LINE_WIDTH: f64 = 1.5;

// VolumeRenderer specific
pub const VOLUME_MIN_BAR_WIDTH: f64 = 1.0; // Similar to PRICE_MIN_CANDLE_WIDTH

// LineRenderer specific
pub const LINE_DEFAULT_WIDTH: f64 = 1.0;
pub const LINE_LAST_PRICE_WIDTH: f64 = 2.0;
pub const LINE_DASH_PATTERN_VALUE: f64 = 5.0; // For dash_values = [VALUE, VALUE]

// OverlayRenderer specific
pub const OVERLAY_CROSSHAIR_DASH_VALUE: f64 = 4.0; // For dash_array = [VALUE, VALUE]
pub const OVERLAY_MOUSE_MOVE_REDRAW_THRESHOLD: f64 = 1.0;
pub const OVERLAY_Y_AXIS_LABEL_HEIGHT: f64 = 20.0; // Different from AXIS_FONT_HEIGHT
pub const OVERLAY_X_AXIS_LABEL_WIDTH: f64 = 80.0;
pub const OVERLAY_X_AXIS_LABEL_HEIGHT: f64 = 20.0;
pub const OVERLAY_TOOLTIP_WIDTH: f64 = 150.0;
pub const OVERLAY_TOOLTIP_LINE_HEIGHT: f64 = 20.0;
pub const OVERLAY_TOOLTIP_PADDING: f64 = 10.0;
pub const OVERLAY_TOOLTIP_MOUSE_OFFSET: f64 = 15.0;
pub const OVERLAY_TOOLTIP_CORNER_RADIUS: f64 = 4.0;
pub const OVERLAY_TOOLTIP_SHADOW_BLUR: f64 = 10.0;
pub const OVERLAY_TOOLTIP_SHADOW_OFFSET_X: f64 = 3.0;
pub const OVERLAY_TOOLTIP_SHADOW_OFFSET_Y: f64 = 3.0;
pub const OVERLAY_TOOLTIP_LABEL_X_OFFSET: f64 = 60.0; // Space for label text like "开盘:"

// DataZoomRenderer specific
pub const DATAZOOM_HANDLE_CLICK_AREA_MULTIPLIER: f64 = 3.0;
pub const DATAZOOM_MIN_INDEX_CHANGE_FOR_DRAG_RESET: isize = 10;
pub const DATAZOOM_CLEAR_PADDING: f64 = 10.0;
pub const DATAZOOM_VOLUME_AREA_SAMPLING_DIVISOR: usize = 100;
pub const DATAZOOM_VOLUME_AREA_DEFAULT_MAX_VOLUME: f64 = 1.0;
pub const DATAZOOM_VOLUME_AREA_MAX_SAMPLE_POINTS: usize = 200;
pub const DATAZOOM_VOLUME_AREA_HEIGHT_SCALE: f64 = 0.8; // e.g. nav_height * 0.8
pub const DATAZOOM_INDICATOR_LINE_WIDTH: f64 = 1.0;
pub const DATAZOOM_DRAGGING_HANDLE_WIDTH_MULTIPLIER: f64 = 1.5;
pub const DATAZOOM_SHADOW_MAX_BLUR: f64 = 4.0;
pub const DATAZOOM_SHADOW_EDGE_DISTANCE_THRESHOLD: f64 = 10.0;

// HeatmapRenderer specific
pub const HEATMAP_COLOR_CACHE_SIZE: usize = 100;
pub const HEATMAP_NORM_DIVISOR_OFFSET: f64 = 99.0; // For i as f64 / 99.0
pub const HEATMAP_RECT_BORDER_ADJUST: f64 = 1.0; // For x_width - 1.0, rect_height - 1.0
pub const HEATMAP_MIN_THRESHOLD: f64 = 0.001;
pub const HEATMAP_ALPHA_BASE: f64 = 0.25; // alpha = BASE + FACTOR * norm
pub const HEATMAP_ALPHA_FACTOR: f64 = 0.75;

// BookRenderer specific
pub const BOOK_TEXT_RESERVED_WIDTH: f64 = 40.0;
pub const BOOK_BAR_BORDER_ADJUST: f64 = 1.0; // for bar_height - 1.0
pub const BOOK_TEXT_X_OFFSET: f64 = 4.0;

// Added for ChartLayout refactoring
pub const MIN_PRICE_DIFF_THRESHOLD: f64 = 0.000001;
pub const DEFAULT_FALLBACK_CANDLE_WIDTH: f64 = 8.0;
pub const CANDLE_WIDTH_RATIO_OF_TOTAL: f64 = 0.8; // Fraction of total_width_per_candle for candle body

// OverlayRenderer specific line widths
pub const OVERLAY_BORDER_LINE_WIDTH: f64 = 1.0;
pub const OVERLAY_SWITCH_BUTTON_LINE_WIDTH: f64 = 1.0;

// OverlayRenderer specific thresholds
pub const OVERLAY_MIN_PRICE_DISPLAY_THRESHOLD: f64 = 0.001;

// OverlayRenderer UI Text Strings
pub const TEXT_TOOLTIP_PRICE: &str = "价格:";
pub const TEXT_TOOLTIP_VOLUME: &str = "数量:";
pub const TEXT_TOOLTIP_OPEN: &str = "开盘:";
pub const TEXT_TOOLTIP_HIGH: &str = "最高:";
pub const TEXT_TOOLTIP_LOW: &str = "最低:";
pub const TEXT_TOOLTIP_CLOSE: &str = "收盘:";
pub const TEXT_TOOLTIP_TOTAL_VOLUME: &str = "成交量:";
pub const TEXT_SWITCH_KLINE: &str = "K线";
pub const TEXT_SWITCH_HEATMAP: &str = "热力图";

// Price formatting thresholds (used in AxisRenderer and potentially OverlayRenderer)
pub const PRICE_FORMAT_THRESHOLD_NO_DECIMAL: f64 = 100.0;
pub const PRICE_FORMAT_THRESHOLD_DEFAULT: f64 = 1.0;
// OVERLAY_MIN_PRICE_DISPLAY_THRESHOLD already exists for specific overlay label use

// VisibleRange specific buffer constants
pub const VISIBLE_RANGE_PRICE_BUFFER_PERCENT: f64 = 0.05;
pub const VISIBLE_RANGE_DEFAULT_PRICE_BUFFER: f64 = 1.0;
pub const VISIBLE_RANGE_DEFAULT_MAX_VOLUME: f64 = 1.0; // For calculate_data_ranges
pub const VISIBLE_RANGE_VOLUME_BUFFER_PERCENT: f64 = 1.05;

// OverlayRenderer tooltip positioning related (can be used by ChartLayout helper)
// OVERLAY_TOOLTIP_MOUSE_OFFSET is already defined
