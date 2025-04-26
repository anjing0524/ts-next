// 图表布局配置 - 定义整个K线图的布局参数
use chrono::DateTime;
// enum HandleType {
//     Left,
//     Right,
//     Middle,
// }
pub struct ChartLayout {
    // 基础尺寸
    pub canvas_width: f64,  // 画布总宽度
    pub canvas_height: f64, // 画布总高度

    // 区域划分
    pub header_height: f64,    // 顶部标题和图例区域高度
    pub y_axis_width: f64,     // 左侧Y轴宽度
    pub time_axis_height: f64, // 时间轴高度
    pub navigator_height: f64, // 底部导航器高度

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

        // K线图参数 - 设置固定的蜡烛宽度和间距，确保与图片中的样式匹配
        let candle_spacing = 1.0; // 蜡烛间的间距，较小以符合图片样式
        let candle_width = 10.0; // 固定蜡烛宽度为10像素
        let total_candle_width = candle_width + candle_spacing; // 单个K线总宽度

        // 计算主图表区域
        let chart_area_x = y_axis_width; // 图表区域X起点(从Y轴右侧开始)
        let chart_area_y = header_height; // 图表区域Y起点(从标题下方开始)
        let chart_area_width = canvas_width - y_axis_width; // 图表区域宽度
        // chart_area_height 会自动根据新的 time_axis_height 调整
        let chart_area_height = canvas_height - header_height - navigator_height - time_axis_height; // 主图区域高度

        // 调整成交量图和价格图的高度比例
        let volume_chart_height = chart_area_height * 0.2; // 成交量图占主图区域的20%
        let price_chart_height = chart_area_height - volume_chart_height; // 价格图占剩余空间
        let volume_chart_y = chart_area_y + price_chart_height; // 成交量图的Y坐标起点

        // 导航器位置 (计算方式不变)
        let navigator_y = canvas_height - navigator_height;

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
            tooltip_fade_duration,
            crosshair_width,
            grid_line_count,
            navigator_y, // 使用更新后的值
            navigator_handle_width,
        }
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

    /// 格式化成交量显示，根据数值大小自动添加K或M后缀
    /// * `volume` - 需要格式化的成交量
    /// * `precision` - 小数点后保留的位数
    /// * 返回格式化后的字符串
    pub fn format_volume(&self, volume: f64, precision: usize) -> String {
        if volume >= 1_000_000.0 {
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

    /// 格式化时间戳为可读的日期时间格式
    /// * `timestamp_secs` - Unix时间戳（秒）
    /// * `format_str` - 格式化字符串，例如"%Y/%m/%d %H:%M"
    /// * 返回格式化后的时间字符串
    pub fn format_timestamp(&self, timestamp_secs: i64, format_str: &str) -> String {
        let dt = DateTime::from_timestamp(timestamp_secs, 0)
            .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap());
        dt.format(format_str).to_string()
    }

    /// 计算导航器中每个K线的宽度
    /// * `items_len` - 数据项总数
    /// * 返回导航器中每个K线的宽度
    pub fn calculate_navigator_candle_width(&self, items_len: usize) -> f64 {
        if items_len == 0 {
            return 1.0; // 默认值
        }
        self.chart_area_width / items_len as f64
    }

    /// 计算导航器中可见区域的起始和结束X坐标
    /// * `items_len` - 数据项总数
    /// * `visible_start` - 可见区域起始索引
    /// * `visible_count` - 可见区域K线数量
    /// * 返回 (visible_start_x, visible_end_x)
    pub fn calculate_visible_range_coordinates(
        &self,
        items_len: usize,
        visible_start: usize,
        visible_count: usize,
    ) -> (f64, f64) {
        let nav_x = self.chart_area_x;
        let nav_width = self.chart_area_width;

        if items_len == 0 {
            return (nav_x, nav_x + nav_width);
        }

        // 确保可见区域不超出数据范围
        let visible_start = visible_start.min(items_len);
        let visible_count = visible_count.min(items_len - visible_start);

        // 计算比例
        let visible_start_ratio = visible_start as f64 / items_len as f64;
        let visible_end_ratio = (visible_start + visible_count) as f64 / items_len as f64;

        let visible_start_x = nav_x + visible_start_ratio * nav_width;
        let visible_end_x = nav_x + visible_end_ratio.min(1.0) * nav_width;

        (visible_start_x, visible_end_x)
    }

    /// 判断点是否在导航器区域内
    /// * `x` - X坐标
    /// * `y` - Y坐标
    /// * 返回是否在导航器区域内
    pub fn is_point_in_navigator(&self, x: f64, y: f64) -> bool {
        x >= self.chart_area_x
            && x <= self.chart_area_x + self.chart_area_width
            && y >= self.navigator_y
            && y <= self.navigator_y + self.navigator_height
    }

    /// 判断点是否在图表主区域内
    /// * `x` - X坐标
    /// * `y` - Y坐标
    /// * 返回是否在图表主区域内
    pub fn is_point_in_chart_area(&self, x: f64, y: f64) -> bool {
        x >= self.chart_area_x
            && x <= self.chart_area_x + self.chart_area_width
            && y >= self.chart_area_y
            && y <= self.chart_area_y + self.chart_area_height
    }

    /// 根据可见K线数量计算蜡烛图宽度
    pub fn calculate_candle_width(&self, visible_count: usize) -> f64 {
        if visible_count == 0 {
            return 8.0; // 默认宽度
        }
        // 计算每根K线的总宽度（包括间距）
        let total_width_per_candle = self.chart_area_width / visible_count as f64;
        // 蜡烛图实体宽度 = 总宽度 - 间距
        let candle_width = (total_width_per_candle * 0.8).max(1.0);

        candle_width
    }

    /// 更新布局参数以适应当前可见K线数量
    pub fn update_for_visible_count(&mut self, visible_count: usize) {
        if visible_count > 0 {
            // 计算新的蜡烛图宽度
            self.candle_width = self.calculate_candle_width(visible_count);

            // 更新K线总宽度（包括间距）
            self.total_candle_width = self.chart_area_width / visible_count as f64;
        }
    }
}
