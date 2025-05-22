// wasm-cal/src/layout/chart_layout.rs

// Add this at the top
use crate::layout::theme::*;

/// ChartLayout 结构体定义了图表的布局参数
#[derive(Debug, Clone, Copy)]
pub struct ChartLayout {
    // 画布尺寸
    pub canvas_width: f64,
    pub canvas_height: f64,

    // 区域高度
    pub header_height: f64,
    pub y_axis_width: f64,
    pub navigator_height: f64,
    pub time_axis_height: f64,

    // 主图表区域坐标和尺寸
    pub chart_area_x: f64,
    pub chart_area_y: f64,
    pub chart_area_width: f64,
    pub chart_area_height: f64,

    // 价格图和成交量图的高度和Y坐标
    pub price_chart_height: f64,
    pub volume_chart_height: f64,
    pub volume_chart_y: f64,

    // K线和间距
    pub candle_width: f64,
    pub candle_spacing: f64,
    pub total_candle_width: f64, // candle_width + candle_spacing

    // 内边距和外边距
    pub padding: f64,
    pub price_margin: f64,
    pub volume_margin: f64,

    // Tooltip 相关
    pub tooltip_width: f64,
    pub tooltip_height: f64,
    pub tooltip_padding: f64,
    pub tooltip_fade_duration: f64, // 毫秒

    // 十字准星和网格线
    pub crosshair_width: f64,
    pub grid_line_count: usize,

    // 导航器区域的Y坐标和手柄宽度
    pub navigator_y: f64,
    pub navigator_handle_width: f64,

    // 模式切换按钮的尺寸
    pub switch_btn_height: f64,
    pub switch_btn_width: f64,

    // 主图表和订单簿区域的宽度
    pub main_chart_width: f64,
    pub book_area_width: f64,
}

impl ChartLayout {
    pub fn new(canvas_width: f64, canvas_height: f64) -> Self {
        let header_height = CL_DEFAULT_HEADER_HEIGHT;
        let y_axis_width = CL_DEFAULT_Y_AXIS_WIDTH;
        let navigator_height = CL_DEFAULT_NAVIGATOR_HEIGHT;
        let padding = DEFAULT_PADDING; // General padding
        let price_margin = CL_DEFAULT_PRICE_MARGIN;
        let volume_margin = CL_DEFAULT_VOLUME_MARGIN;

        let tooltip_width = CL_DEFAULT_TOOLTIP_WIDTH;
        let tooltip_height = CL_DEFAULT_TOOLTIP_HEIGHT;
        let tooltip_padding = CL_DEFAULT_TOOLTIP_PADDING;
        let tooltip_fade_duration = CL_DEFAULT_TOOLTIP_FADE_DURATION;

        let crosshair_width = CL_DEFAULT_CROSSHAIR_WIDTH;
        let grid_line_count = CL_DEFAULT_GRID_LINE_COUNT;
        let time_axis_height = CL_DEFAULT_TIME_AXIS_HEIGHT;
        let navigator_handle_width = CL_DEFAULT_NAVIGATOR_HANDLE_WIDTH;

        let candle_spacing = CL_DEFAULT_CANDLE_SPACING;
        let candle_width = CL_DEFAULT_CANDLE_WIDTH_INITIAL; // Initial fixed width
        let total_candle_width = candle_width + candle_spacing;

        let chart_area_x = y_axis_width;
        let chart_area_y = header_height;
        let chart_area_width = canvas_width - y_axis_width;
        let main_chart_width = chart_area_width * CL_MAIN_CHART_RATIO;
        let book_area_width = chart_area_width * CL_BOOK_AREA_RATIO;
        
        let chart_area_height = canvas_height - header_height - navigator_height - time_axis_height;

        let volume_chart_height = chart_area_height * CL_KLINE_MODE_VOLUME_RATIO; // Default to kline mode ratio
        let price_chart_height = chart_area_height - volume_chart_height;
        let volume_chart_y = chart_area_y + price_chart_height;

        let navigator_y = canvas_height - navigator_height;

        let switch_btn_height = CL_DEFAULT_SWITCH_BTN_HEIGHT;
        let switch_btn_width = CL_DEFAULT_SWITCH_BTN_WIDTH;

        Self {
            canvas_width,
            canvas_height,
            header_height,
            y_axis_width,
            navigator_height,
            time_axis_height,
            chart_area_x,
            chart_area_y,
            chart_area_width,
            chart_area_height,
            price_chart_height,
            volume_chart_height,
            volume_chart_y,
            candle_width, // This will be updated dynamically
            candle_spacing,
            total_candle_width, // This will be updated dynamically
            padding,
            price_margin,
            volume_margin,
            tooltip_width,
            tooltip_height,
            tooltip_padding,
            tooltip_fade_duration,
            crosshair_width,
            grid_line_count,
            navigator_y,
            navigator_handle_width,
            switch_btn_height,
            switch_btn_width,
            main_chart_width,
            book_area_width,
        }
    }

    /// 计算可用的价格图高度（减去上下边距）
    pub fn usable_price_chart_height(&self) -> f64 {
        self.price_chart_height - 2.0 * self.price_margin // 2.0 is a common factor
    }

    /// 计算可用的成交量图高度（减去上下边距）
    pub fn usable_volume_chart_height(&self) -> f64 {
        self.volume_chart_height - 2.0 * self.volume_margin // 2.0 is a common factor
    }

    /// 将价格映射到Y坐标 (价格图)
    pub fn map_price_to_y(&self, price: f64, min_low: f64, max_high: f64) -> f64 {
        let usable_height = self.usable_price_chart_height();
        if usable_height <= 0.0 || (max_high - min_low).abs() < MIN_PRICE_DIFF_THRESHOLD { // Use new constant
            return self.chart_area_y + self.price_margin; // 返回顶部或一个安全位置
        }
        let price_ratio = (price - min_low) / (max_high - min_low);
        self.chart_area_y + self.price_chart_height
            - self.price_margin
            - price_ratio * usable_height
    }

    /// 将Y坐标映射回价格 (价格图)
    pub fn map_y_to_price(&self, y: f64, min_low: f64, max_high: f64) -> f64 {
        let usable_height = self.usable_price_chart_height();
        if usable_height <= 0.0 || (max_high - min_low).abs() < MIN_PRICE_DIFF_THRESHOLD { // Use new constant
            return min_low; // 或其他默认值
        }
        let y_ratio = (self.chart_area_y + self.price_chart_height - self.price_margin - y)
            / usable_height;
        min_low + y_ratio * (max_high - min_low)
    }

    /// 将成交量映射到Y坐标 (成交量图)
    pub fn map_volume_to_y(&self, volume: f64, max_volume: f64) -> f64 {
        let usable_height = self.usable_volume_chart_height();
        if usable_height <= 0.0 || max_volume == 0.0 {
            return self.volume_chart_y + self.volume_chart_height - self.volume_margin; // 返回底部或一个安全位置
        }
        let volume_ratio = volume / max_volume;
        self.volume_chart_y + self.volume_chart_height
            - self.volume_margin
            - volume_ratio * usable_height
    }

    /// 将Y坐标映射回成交量 (成交量图)
    pub fn map_y_to_volume(&self, y: f64, max_volume: f64) -> f64 {
        let usable_height = self.usable_volume_chart_height();
        if usable_height <= 0.0 || max_volume == 0.0 {
            return 0.0;
        }
        let y_ratio = (self.volume_chart_y + self.volume_chart_height - self.volume_margin - y)
            / usable_height;
        y_ratio * max_volume
    }

    /// 将K线索引映射到X坐标 (中心点)
    pub fn map_index_to_x(&self, index: usize, visible_start_index: usize) -> f64 {
        self.chart_area_x
            + (index as f64 - visible_start_index as f64) * self.total_candle_width
            + self.total_candle_width / 2.0
    }

    /// 将X坐标映射回K线索引 (最近的)
    pub fn map_x_to_index(&self, x: f64, visible_start_index: usize) -> usize {
        if self.total_candle_width <= 0.0 {
            return visible_start_index;
        }
        let relative_x = x - self.chart_area_x;
        let index_offset = (relative_x / self.total_candle_width).floor() as isize;
        (visible_start_index as isize + index_offset).max(0) as usize
    }
    
    /// 计算导航器中每个K线的宽度
    pub fn calculate_navigator_candle_width(&self, items_len: usize) -> f64 {
        if items_len == 0 {
            return VOLUME_MIN_BAR_WIDTH; // Use existing constant
        }
        self.main_chart_width / items_len as f64
    }

    /// 根据可见K线数量计算合适的K线宽度
    pub fn calculate_candle_width(&self, visible_count: usize) -> f64 {
        if visible_count == 0 {
            return DEFAULT_FALLBACK_CANDLE_WIDTH; // Use new constant
        }
        let total_width_per_candle = self.main_chart_width / visible_count as f64;
        (total_width_per_candle * CANDLE_WIDTH_RATIO_OF_TOTAL).max(PRICE_MIN_CANDLE_WIDTH) // Use new and existing constants
    }

    /// 应用热图布局（调整价格图和成交量图的比例）
    pub fn apply_heatmap_layout(&mut self) {
        self.volume_chart_height = self.chart_area_height * CL_HEATMAP_MODE_VOLUME_RATIO; // Use constant
        self.price_chart_height = self.chart_area_height - self.volume_chart_height;
        self.volume_chart_y = self.chart_area_y + self.price_chart_height;
    }

    /// 应用K线图布局（恢复默认比例）
    pub fn apply_kline_layout(&mut self) {
        self.volume_chart_height = self.chart_area_height * CL_KLINE_MODE_VOLUME_RATIO; // Use constant
        self.price_chart_height = self.chart_area_height - self.volume_chart_height;
        self.volume_chart_y = self.chart_area_y + self.price_chart_height;
    }

    /// 判断当前是否为热图模式
    pub fn is_heatmap_mode(&self) -> bool {
        self.volume_chart_height < self.chart_area_height * CL_HEATMAP_MODE_THRESHOLD_RATIO // Use constant
    }

    /// 检查点是否在导航器区域内
    pub fn is_point_in_navigator(&self, y: f64) -> bool {
        y >= self.navigator_y && y <= self.navigator_y + self.navigator_height
    }

    /// 检查点是否在主图表区域内 (不包括Y轴和Header)
    pub fn is_point_in_chart_area(&self, x: f64, y: f64) -> bool {
        x >= self.chart_area_x
            && x <= self.chart_area_x + self.chart_area_width
            && y >= self.chart_area_y
            && y <= self.chart_area_y + self.chart_area_height
    }

    /// 检查点是否在主图表区域内（不包括订单簿、Y轴和Header）
    pub fn is_point_in_main_chart_area(&self, x: f64, y: f64) -> bool {
        x >= self.chart_area_x
            && x <= self.chart_area_x + self.main_chart_width // 使用 main_chart_width
            && y >= self.chart_area_y
            && y <= self.chart_area_y + self.chart_area_height
    }
    
    /// 检查点是否在订单簿区域内
    pub fn is_point_in_book_area(&self, x: f64, y: f64) -> bool {
        x >= self.chart_area_x + self.chart_area_width * CL_MAIN_CHART_RATIO // Use constant
            && x <= self.chart_area_x + self.chart_area_width // chart_area_width is fine here
            && y >= self.chart_area_y
            && y <= self.chart_area_y + self.price_chart_height // 仅价格图区域可交互
    }

    /// 根据可见K线数量更新K线宽度和总宽度
    pub fn update_for_visible_count(&mut self, visible_count: usize) {
        self.candle_width = self.calculate_candle_width(visible_count);
        self.total_candle_width = self.candle_width + self.candle_spacing;
    }
}
