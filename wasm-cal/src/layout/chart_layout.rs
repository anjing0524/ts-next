// 图表布局配置 - 定义整个K线图的布局参数
use chrono::DateTime;

#[derive(Clone)]
pub struct ChartLayout {
    // 基础尺寸
    pub canvas_width: f64,  // 画布总宽度
    pub canvas_height: f64, // 画布总高度

    // 区域划分
    pub header_height: f64,    // 顶部标题和图例区域高度
    pub y_axis_width: f64,     // 左侧Y轴宽度
    pub navigator_height: f64, // 底部导航器高度
    pub time_axis_height: f64, // 时间轴高度

    // 计算得出的区域坐标
    pub chart_area_x: f64,      // 图表区域起始X坐标(一般等于y_axis_width)
    pub chart_area_y: f64,      // 图表区域起始Y坐标(一般等于header_height)
    pub chart_area_width: f64,  // 图表区域宽度(不包括Y轴) canvas_width - y_axis_width
    pub chart_area_height: f64, // 图表区域总高度(包括K线和成交量) 等于 canvas_height-header_height-navigator_height

    // 子图表区域
    pub price_chart_height: f64,  // 价格图(K线)高度
    pub volume_chart_height: f64, // 成交量图高度
    pub volume_chart_y: f64,      // 成交量图Y坐标起点(位于K线图下方)

    // K线绘制参数
    pub candle_width: f64,       // 单个K线蜡烛宽度
    pub candle_spacing: f64,     // K线之间的间距
    pub total_candle_width: f64, // 单个K线总宽度(蜡烛宽度+间距)

    // 边距和内边距
    pub padding: f64,       // 通用内边距
    pub price_margin: f64,  // 价格图表上下边距(防止K线贴边)
    pub volume_margin: f64, // 成交量图表上下边距

    // 提示框参数
    pub tooltip_width: f64,         // 提示框宽度
    pub tooltip_height: f64,        // 提示框高度
    pub tooltip_padding: f64,       // 提示框内边距
    pub tooltip_fade_duration: f64, // 提示框淡入淡出持续时间(毫秒)

    // 交互元素
    pub crosshair_width: f64,   // 十字光标线宽度
    pub grid_line_count: usize, // 网格线数量

    // 导航器参数
    pub navigator_y: f64,            // 导航器Y坐标起点
    pub navigator_handle_width: f64, // 导航器滑块宽度
    pub navigator_candle_width: f64, // 导航器中每个K线的宽度
    pub navigator_drag_active: bool, // 导航器是否处于拖动状态
    pub navigator_drag_start_x: f64, // 导航器拖动起始X坐标

    // 导航器状态
    pub navigator_visible_start: usize, // 导航器中可见区域的起始索引
    pub navigator_visible_count: usize, // 导航器中可见区域的K线数量

    // 拖动状态
    pub dragging_handle: Option<&'static str>, // 当前拖动的手柄类型: "left", "right", "middle"
    pub drag_start_x: f64,                     // 拖动开始时的X坐标
    pub drag_start_visible_start: usize,       // 拖动开始时的可见区域起始索引

    // 悬浮状态
    pub hover_candle_index: Option<usize>,  // 当前悬浮的K线索引
    pub hover_position: Option<(f64, f64)>, // 当前悬浮位置(x, y)
    pub show_tooltip: bool,                 // 是否显示提示框
}

impl ChartLayout {
    /// 创建新的图表布局实例
    /// * `canvas_width` - 画布总宽度
    /// * `canvas_height` - 画布总高度
    /// * `ChartLayout` - 新的布局实例
    pub fn new(canvas_width: f64, canvas_height: f64) -> Self {
        // 基础布局参数
        let header_height = 25.0; // 顶部标题区域高度
        let y_axis_width = 60.0; // 左侧Y轴宽度
        let navigator_height = 40.0; // 底部导航器高度(增加高度以便更好地交互)
        let padding = 8.0; // 通用内边距
        let price_margin = 8.0; // 价格图表上下边距
        let volume_margin = 2.0; // 成交量图表上下边距

        let tooltip_width = 140.0; // 提示框宽度
        let tooltip_height = 100.0; // 提示框高度
        let tooltip_padding = 6.0; // 提示框内边距
        // Define tooltip_fade_duration here
        let tooltip_fade_duration = 200.0; // Default fade duration in ms

        let crosshair_width = 1.0; // 十字光标线宽度
        let grid_line_count = 5; // 网格线数量
        // 修正：增加时间轴高度以容纳两行标签
        let time_axis_height = 30.0; // 时间轴高度 (原为 20.0)
        let navigator_handle_width = 4.0; // 导航器滑块宽度(减小宽度使其更精细)

        // K线图参数
        let candle_width = 6.0; // K线宽度
        let candle_spacing = 2.0; // 间距
        let total_candle_width = candle_width + candle_spacing; // 单个K线总占用宽度

        // 计算主图表区域
        let chart_area_x = y_axis_width; // 图表区域X起点(从Y轴右侧开始)
        let chart_area_y = header_height; // 图表区域Y起点(从标题下方开始)
        let chart_area_width = canvas_width - y_axis_width; // 图表区域宽度
        // chart_area_height 会自动根据新的 time_axis_height 调整
        let chart_area_height = canvas_height - header_height - navigator_height - time_axis_height; // 主图区域高度

        // 调整成交量图和价格图的高度比例
        let volume_chart_height = chart_area_height * 0.15; // 成交量图占主图区域的15%
        let price_chart_height = chart_area_height - volume_chart_height; // 价格图占剩余空间
        let volume_chart_y = chart_area_y + price_chart_height; // 成交量图的Y坐标起点

        // 导航器位置 (计算方式不变)
        let navigator_y = canvas_height - navigator_height;

        // 导航器中每个K线的宽度 - 这个值应该根据实际数据量动态计算
        // 这里先设置一个默认值，后续会在绘制时根据实际数据量重新计算
        let navigator_candle_width = 1.0;

        // 计算初始可见K线数量 (根据画布宽度和K线宽度计算)
        let initial_visible_count = (chart_area_width / total_candle_width).floor() as usize;

        // 初始导航器状态
        let navigator_total_count = 0; // 初始时未知，将在数据加载后更新
        let navigator_visible_start = 0; // 初始时从头开始
        let navigator_visible_count = initial_visible_count; // 初始可见数量

        Self {
            canvas_width,
            canvas_height,
            header_height,
            y_axis_width,
            navigator_height,
            time_axis_height, // 使用更新后的值
            chart_area_x,
            chart_area_y,
            chart_area_width,
            chart_area_height,   // 使用更新后的值
            price_chart_height,  // 使用更新后的值
            volume_chart_height, // 使用更新后的值
            volume_chart_y,      // 使用更新后的值
            candle_width,
            candle_spacing,
            total_candle_width,
            padding,
            price_margin,
            volume_margin,
            tooltip_width,
            tooltip_height,
            tooltip_padding,
            tooltip_fade_duration, // Initialize tooltip_fade_duration
            crosshair_width,
            grid_line_count,
            navigator_y, // 使用更新后的值
            navigator_candle_width,
            navigator_handle_width,
            navigator_visible_start,
            navigator_visible_count,
            // --- Add missing fields with default values ---
            navigator_drag_active: false,
            navigator_drag_start_x: 0.0,
            dragging_handle: None,
            drag_start_x: 0.0,
            drag_start_visible_start: 0,
            hover_candle_index: None,
            hover_position: None,
            show_tooltip: false,
            // --- End of added fields ---
        }
    }

    // 添加一个方法来更新导航器中每个K线的宽度
    pub fn update_navigator_candle_width(&mut self, total_items: usize) {
        if total_items > 0 {
            self.navigator_candle_width = self.chart_area_width / total_items as f64;
        }
    }

    // 计算导航器可见区域的位置和宽度
    // 在 ChartLayout 实现中添加以下方法

    // 设置可见区域
    pub fn set_visible_area(&mut self, start: usize, count: usize) {
        self.navigator_visible_start = start;
        self.navigator_visible_count = count;
    }

    // 获取可用的价格图表高度（减去边距）
    pub fn usable_price_chart_height(&self) -> f64 {
        self.price_chart_height - 2.0 * self.price_margin
    }

    // 将价格映射到Y坐标
    pub fn map_price_to_y(&self, price: f64, min_low: f64, max_high: f64) -> f64 {
        let usable_height = self.usable_price_chart_height();
        if usable_height <= 0.0 || (max_high - min_low).abs() < 0.000001 {
            return self.chart_area_y + self.price_margin; // 避免除以零
        }

        let price_ratio = (price - min_low) / (max_high - min_low);
        self.chart_area_y + self.price_chart_height
            - self.price_margin
            - price_ratio * usable_height
    }

    // 将Y坐标映射到价格
    pub fn map_y_to_price(&self, y: f64, min_low: f64, max_high: f64) -> f64 {
        let price_range = max_high - min_low;
        if price_range <= 0.0 {
            return 0.0;
        }

        let chart_height = self.price_chart_height - 2.0 * self.price_margin;
        let relative_y = y - (self.chart_area_y + self.price_margin);
        let price_ratio = relative_y / chart_height;

        max_high - price_ratio * price_range
    }

    // 将成交量映射到Y坐标
    pub fn map_volume_to_y(&self, volume: f64, max_volume: f64) -> f64 {
        let usable_height = self.volume_chart_height - 2.0 * self.volume_margin;
        if usable_height <= 0.0 || max_volume <= 0.0 {
            return self.volume_chart_y + self.volume_margin; // 避免除以零
        }

        let volume_ratio = volume / max_volume;
        self.volume_chart_y + self.volume_chart_height
            - self.volume_margin
            - volume_ratio * usable_height
    }

    // 将Y坐标映射到成交量
    pub fn map_y_to_volume(&self, y: f64, max_volume: f64) -> f64 {
        let usable_height = self.volume_chart_height - 2.0 * self.volume_margin;
        if usable_height <= 0.0 || max_volume <= 0.0 {
            return 0.0; // 避免除以零
        }
        let volume_ratio = 1.0 - (y - self.volume_chart_y - self.volume_margin) / usable_height;
        volume_ratio * max_volume
    }

    // 获取K线的X坐标位置
    pub fn get_candle_x_position(&self, index: usize, visible_start_index: usize) -> f64 {
        let relative_index = index - visible_start_index;
        self.chart_area_x + (relative_index as f64) * self.total_candle_width
    }

    // 计算提示框位置
    pub fn calculate_tooltip_position(&self, mouse_x: f64, mouse_y: f64) -> (f64, f64) {
        // 默认将提示框放在鼠标右侧
        let mut tooltip_x = mouse_x + 10.0;
        let mut tooltip_y = mouse_y - self.tooltip_height / 2.0;

        // 如果提示框超出右边界，则放在鼠标左侧
        if tooltip_x + self.tooltip_width > self.canvas_width {
            tooltip_x = mouse_x - 10.0 - self.tooltip_width;
        }

        // 确保提示框不超出上下边界
        if tooltip_y < 0.0 {
            tooltip_y = 0.0;
        } else if tooltip_y + self.tooltip_height > self.canvas_height {
            tooltip_y = self.canvas_height - self.tooltip_height;
        }

        (tooltip_x, tooltip_y)
    }

    // 格式化日期用于坐标轴显示
    pub fn format_date_for_axis(&self, timestamp: i64) -> String {
        if let Some(dt) = DateTime::from_timestamp(timestamp, 0) {
            dt.format("%Y-%m-%d %H:%M").to_string()
        } else {
            "Invalid Date".to_string()
        }
    }

    // 开始导航器拖动
    pub fn start_navigator_drag(&mut self, mouse_x: f64) {
        self.navigator_drag_active = true;
        self.navigator_drag_start_x = mouse_x;
    }

    // 处理导航器拖动
    pub fn handle_navigator_drag(&mut self, mouse_x: f64, total_candles: usize) -> (usize, usize) {
        if !self.navigator_drag_active {
            return (self.navigator_visible_start, self.navigator_visible_count);
        }

        let drag_distance = mouse_x - self.navigator_drag_start_x;
        let candles_per_pixel = total_candles as f64 / self.chart_area_width;
        let candle_shift = (drag_distance * candles_per_pixel).round() as isize;

        // 更新拖动起始位置
        self.navigator_drag_start_x = mouse_x;

        // 计算新的可见区域起始索引
        let new_start = self.navigator_visible_start as isize - candle_shift;
        let new_start = new_start
            .max(0)
            .min((total_candles - self.navigator_visible_count) as isize)
            as usize;

        self.navigator_visible_start = new_start;

        (new_start, self.navigator_visible_count)
    }

    // 结束导航器拖动
    pub fn end_navigator_drag(&mut self) {
        self.navigator_drag_active = false;
    }

    // 根据X坐标获取K线索引
    pub fn get_candle_index_from_x(
        &self,
        x: f64,
        visible_start: usize,
        total_items: usize,
    ) -> Option<usize> {
        if x < self.chart_area_x || x > self.chart_area_x + self.chart_area_width {
            return None;
        }

        let relative_x = x - self.chart_area_x;
        let candle_idx = (relative_x / self.total_candle_width).floor() as usize;

        let absolute_idx = visible_start + candle_idx;
        if absolute_idx < total_items {
            Some(absolute_idx)
        } else {
            None
        }
    }

    // 确保 calculate_navigator_visible_area 方法可以在可变引用上调用
    pub fn calculate_navigator_visible_area(&mut self, total_items: usize) -> (f64, f64, f64) {
        let start_x =
            self.chart_area_x + self.navigator_visible_start as f64 * self.navigator_candle_width;
        let end_x = self.chart_area_x
            + (self.navigator_visible_start + self.navigator_visible_count) as f64
                * self.navigator_candle_width;
        let width = self.navigator_visible_count as f64 * self.navigator_candle_width;

        (start_x, end_x, width)
    }
}
