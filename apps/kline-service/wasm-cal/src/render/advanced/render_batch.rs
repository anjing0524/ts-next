//! 渲染批次管理 - 优化Canvas API调用的批处理操作

use crate::config::ChartTheme;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 批处理操作类型
#[derive(Debug)]
pub enum BatchOperation {
    FillRect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    StrokeRect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    MoveTo {
        x: f64,
        y: f64,
    },
    LineTo {
        x: f64,
        y: f64,
    },
    Rect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    FillText {
        text: String,
        x: f64,
        y: f64,
    },
    StrokeText {
        text: String,
        x: f64,
        y: f64,
    },
}

/// 批处理样式设置
#[derive(Debug, Clone)]
pub struct BatchStyle {
    pub fill_style: Option<String>,
    pub stroke_style: Option<String>,
    pub line_width: Option<f64>,
    pub font: Option<String>,
    pub text_align: Option<String>,
    pub text_baseline: Option<String>,
}

/// 渲染批次
pub struct RenderBatch {
    operations: Vec<BatchOperation>,
    current_style: BatchStyle,
    pending_style: BatchStyle,
}

impl RenderBatch {
    /// 创建新的渲染批次
    pub fn new() -> Self {
        Self {
            operations: Vec::new(),
            current_style: BatchStyle {
                fill_style: None,
                stroke_style: None,
                line_width: None,
                font: None,
                text_align: None,
                text_baseline: None,
            },
            pending_style: BatchStyle {
                fill_style: None,
                stroke_style: None,
                line_width: None,
                font: None,
                text_align: None,
                text_baseline: None,
            },
        }
    }

    /// 设置填充样式
    pub fn set_fill_style(&mut self, style: &str) {
        self.pending_style.fill_style = Some(style.to_string());
    }

    /// 设置描边样式
    pub fn set_stroke_style(&mut self, style: &str) {
        self.pending_style.stroke_style = Some(style.to_string());
    }

    /// 设置线宽
    pub fn set_line_width(&mut self, width: f64) {
        self.pending_style.line_width = Some(width);
    }

    /// 设置字体
    pub fn set_font(&mut self, font: &str) {
        self.pending_style.font = Some(font.to_string());
    }

    /// 设置文本对齐方式
    pub fn set_text_align(&mut self, align: &str) {
        self.pending_style.text_align = Some(align.to_string());
    }

    /// 设置文本基线
    pub fn set_text_baseline(&mut self, baseline: &str) {
        self.pending_style.text_baseline = Some(baseline.to_string());
    }

    /// 添加填充矩形操作
    pub fn fill_rect(&mut self, x: f64, y: f64, width: f64, height: f64) {
        self.apply_pending_styles();
        self.operations.push(BatchOperation::FillRect {
            x,
            y,
            width,
            height,
        });
    }

    /// 添加描边矩形操作
    pub fn stroke_rect(&mut self, x: f64, y: f64, width: f64, height: f64) {
        self.apply_pending_styles();
        self.operations.push(BatchOperation::StrokeRect {
            x,
            y,
            width,
            height,
        });
    }

    /// 开始路径
    pub fn begin_path(&mut self) {
        // 路径操作通常需要立即应用样式
        self.apply_pending_styles();
        // 在批处理中，begin_path只是一个标记，实际的路径操作会收集到一起
    }

    /// 移动到指定点
    pub fn move_to(&mut self, x: f64, y: f64) {
        self.operations.push(BatchOperation::MoveTo { x, y });
    }

    /// 画线到指定点
    pub fn line_to(&mut self, x: f64, y: f64) {
        self.operations.push(BatchOperation::LineTo { x, y });
    }

    /// 添加矩形到路径
    pub fn rect(&mut self, x: f64, y: f64, width: f64, height: f64) {
        self.operations.push(BatchOperation::Rect {
            x,
            y,
            width,
            height,
        });
    }

    /// 填充文本
    pub fn fill_text(&mut self, text: &str, x: f64, y: f64) {
        self.apply_pending_styles();
        self.operations.push(BatchOperation::FillText {
            text: text.to_string(),
            x,
            y,
        });
    }

    /// 描边文本
    pub fn stroke_text(&mut self, text: &str, x: f64, y: f64) {
        self.apply_pending_styles();
        self.operations.push(BatchOperation::StrokeText {
            text: text.to_string(),
            x,
            y,
        });
    }

    /// 应用待处理的样式
    fn apply_pending_styles(&mut self) {
        if self.pending_style.fill_style.is_some() {
            self.current_style.fill_style = self.pending_style.fill_style.take();
        }
        if self.pending_style.stroke_style.is_some() {
            self.current_style.stroke_style = self.pending_style.stroke_style.take();
        }
        if self.pending_style.line_width.is_some() {
            self.current_style.line_width = self.pending_style.line_width.take();
        }
        if self.pending_style.font.is_some() {
            self.current_style.font = self.pending_style.font.take();
        }
        if self.pending_style.text_align.is_some() {
            self.current_style.text_align = self.pending_style.text_align.take();
        }
        if self.pending_style.text_baseline.is_some() {
            self.current_style.text_baseline = self.pending_style.text_baseline.take();
        }
    }

    /// 执行批处理操作
    pub fn execute(&self, ctx: &OffscreenCanvasRenderingContext2d) {
        // 应用当前样式
        if let Some(ref fill_style) = self.current_style.fill_style {
            ctx.set_fill_style_str(fill_style);
        }
        if let Some(ref stroke_style) = self.current_style.stroke_style {
            ctx.set_stroke_style_str(stroke_style);
        }
        if let Some(line_width) = self.current_style.line_width {
            ctx.set_line_width(line_width);
        }
        if let Some(ref font) = self.current_style.font {
            ctx.set_font(font);
        }
        if let Some(ref text_align) = self.current_style.text_align {
            ctx.set_text_align(text_align);
        }
        if let Some(ref text_baseline) = self.current_style.text_baseline {
            ctx.set_text_baseline(text_baseline);
        }

        // 执行所有操作
        let mut in_path = false;

        for op in &self.operations {
            match op {
                BatchOperation::FillRect {
                    x,
                    y,
                    width,
                    height,
                } => {
                    if in_path {
                        ctx.fill();
                        in_path = false;
                    }
                    ctx.fill_rect(*x, *y, *width, *height);
                }
                BatchOperation::StrokeRect {
                    x,
                    y,
                    width,
                    height,
                } => {
                    if in_path {
                        ctx.stroke();
                        in_path = false;
                    }
                    ctx.stroke_rect(*x, *y, *width, *height);
                }
                BatchOperation::MoveTo { x, y } => {
                    if !in_path {
                        ctx.begin_path();
                        in_path = true;
                    }
                    ctx.move_to(*x, *y);
                }
                BatchOperation::LineTo { x, y } => {
                    if !in_path {
                        ctx.begin_path();
                        in_path = true;
                    }
                    ctx.line_to(*x, *y);
                }
                BatchOperation::Rect {
                    x,
                    y,
                    width,
                    height,
                } => {
                    if !in_path {
                        ctx.begin_path();
                        in_path = true;
                    }
                    ctx.rect(*x, *y, *width, *height);
                }
                BatchOperation::FillText { text, x, y } => {
                    if in_path {
                        ctx.fill();
                        in_path = false;
                    }
                    let _ = ctx.fill_text(text, *x, *y);
                }
                BatchOperation::StrokeText { text, x, y } => {
                    if in_path {
                        ctx.stroke();
                        in_path = false;
                    }
                    let _ = ctx.stroke_text(text, *x, *y);
                }
            }
        }

        // 如果路径未关闭，关闭它
        if in_path {
            ctx.fill(); // 默认填充，也可以根据需要改为stroke()
        }
    }

    /// 清空批处理操作
    pub fn clear(&mut self) {
        self.operations.clear();
        // 保留当前样式，但清除待处理样式
        self.pending_style = BatchStyle {
            fill_style: None,
            stroke_style: None,
            line_width: None,
            font: None,
            text_align: None,
            text_baseline: None,
        };
    }

    /// 获取操作数量
    pub fn len(&self) -> usize {
        self.operations.len()
    }

    /// 检查是否为空
    pub fn is_empty(&self) -> bool {
        self.operations.is_empty()
    }
}

impl Default for RenderBatch {
    fn default() -> Self {
        Self::new()
    }
}

/// 特定用途的批处理器 - 用于K线图渲染
pub struct CandleBatch {
    bullish_rects: Vec<(f64, f64, f64, f64)>, // (x, y, width, height)
    bearish_rects: Vec<(f64, f64, f64, f64)>,
    bullish_lines: Vec<(f64, f64, f64, f64)>, // (x1, y1, x2, y2)
    bearish_lines: Vec<(f64, f64, f64, f64)>,
    theme: ChartTheme,
}

impl CandleBatch {
    /// 创建新的K线批处理器
    pub fn new(theme: ChartTheme) -> Self {
        Self {
            bullish_rects: Vec::new(),
            bearish_rects: Vec::new(),
            bullish_lines: Vec::new(),
            bearish_lines: Vec::new(),
            theme,
        }
    }

    /// 添加上涨K线实体
    pub fn add_bullish_candle(&mut self, x: f64, y: f64, width: f64, height: f64) {
        self.bullish_rects.push((x, y, width, height));
    }

    /// 添加下跌K线实体
    pub fn add_bearish_candle(&mut self, x: f64, y: f64, width: f64, height: f64) {
        self.bearish_rects.push((x, y, width, height));
    }

    /// 添加上涨K线影线
    pub fn add_bullish_shadow(&mut self, x: f64, high_y: f64, low_y: f64) {
        self.bullish_lines.push((x, high_y, x, low_y));
    }

    /// 添加下跌K线影线
    pub fn add_bearish_shadow(&mut self, x: f64, high_y: f64, low_y: f64) {
        self.bearish_lines.push((x, high_y, x, low_y));
    }

    /// 执行批处理绘制
    pub fn execute(&self, ctx: &OffscreenCanvasRenderingContext2d) {
        // 批量绘制上涨K线实体
        if !self.bullish_rects.is_empty() {
            ctx.set_fill_style_str(&self.theme.bullish);
            ctx.begin_path();
            for &(x, y, width, height) in &self.bullish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }

        // 批量绘制下跌K线实体
        if !self.bearish_rects.is_empty() {
            ctx.set_fill_style_str(&self.theme.bearish);
            ctx.begin_path();
            for &(x, y, width, height) in &self.bearish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }

        // 批量绘制上涨K线影线
        if !self.bullish_lines.is_empty() {
            ctx.set_stroke_style_str(&self.theme.bullish);
            ctx.set_line_width(1.5);
            ctx.begin_path();
            for &(x1, y1, x2, y2) in &self.bullish_lines {
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
            }
            ctx.stroke();
        }

        // 批量绘制下跌K线影线
        if !self.bearish_lines.is_empty() {
            ctx.set_stroke_style_str(&self.theme.bearish);
            ctx.set_line_width(1.5);
            ctx.begin_path();
            for &(x1, y1, x2, y2) in &self.bearish_lines {
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
            }
            ctx.stroke();
        }
    }

    /// 清空批处理数据
    pub fn clear(&mut self) {
        self.bullish_rects.clear();
        self.bearish_rects.clear();
        self.bullish_lines.clear();
        self.bearish_lines.clear();
    }
}
