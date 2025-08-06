//! 渲染节流模块 - 提供基于时间和距离的节流/防抖机制
use crate::command::event::Event;
use wasm_bindgen::prelude::*;

const MOUSE_MOVE_INTERVAL_MS: f64 = 0.0; // 无时间节流
const MOUSE_MOVE_MIN_DISTANCE_SQ: f64 = 0.0; // 禁用距离节流，允许所有鼠标移动事件
const WHEEL_COALESCE_INTERVAL_MS: f64 = 50.0; // 50ms内滚轮事件合并
const WHEEL_MIN_DELTA: f64 = 0.1; // 最小滚轮增量阈值
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
    #[wasm_bindgen(js_namespace = console, js_name = time)]
    fn time(label: &str);
    #[wasm_bindgen(js_namespace = console, js_name = timeEnd)]
    fn time_end(label: &str);
}
#[derive(Clone)]
pub struct EventThrottle {
    last_move_time: f64,
    last_move_x: f64,
    last_move_y: f64,
    last_wheel_time: f64,
    pub wheel_accumulator: f64,
}

impl EventThrottle {
    pub fn new() -> Self {
        Self {
            last_move_time: 0.0,
            last_move_x: 0.0,
            last_move_y: 0.0,
            last_wheel_time: 0.0,
            wheel_accumulator: 0.0,
        }
    }

    pub fn should_process(&mut self, event: &Event) -> bool {
        let now = web_sys::window()
            .and_then(|win| win.performance())
            .map_or(0.0, |perf| perf.now());

        match event {
            Event::MouseMove { x, y } => {
                // 计算移动距离（用于日志记录）
                let dist_sq = (x - self.last_move_x).powi(2) + (y - self.last_move_y).powi(2);

                // 由于距离节流已被禁用，所有鼠标移动事件都允许通过
                // 更新位置和时间戳
                self.last_move_x = *x;
                self.last_move_y = *y;
                self.last_move_time = now;
                log(&format!(
                    "EventThrottle: MouseMove allowed: distance={}px",
                    dist_sq.sqrt()
                ));
                true
            }
            Event::Wheel { delta, .. } => {
                // 滚轮事件合并
                self.wheel_accumulator += delta;

                // 检查是否达到最小阈值或时间间隔
                if (self.wheel_accumulator.abs() >= WHEEL_MIN_DELTA
                    || now - self.last_wheel_time > WHEEL_COALESCE_INTERVAL_MS)
                    && now - self.last_wheel_time > 16.0
                {
                    // 至少16ms间隔
                    self.last_wheel_time = now;
                    return true;
                }
                false
            }
            _ => true, // 其他事件不节流
        }
    }

    pub fn reset_wheel_accumulator(&mut self) {
        self.wheel_accumulator = 0.0;
    }
}

impl Default for EventThrottle {
    fn default() -> Self {
        Self::new()
    }
}

/// 渲染节流配置
#[derive(Debug, Clone, Copy, Default)]
pub struct ThrottleConfig {
    /// 最小时间间隔（毫秒）
    pub min_interval_ms: f64,
    /// 是否启用节流
    pub enabled: bool,
}

/// 渲染节流器
#[derive(Debug, Clone)]
pub struct RenderThrottle {
    config: ThrottleConfig,
    last_render_time: f64,
}

impl RenderThrottle {
    /// 创建新的渲染节流器
    pub fn new(config: ThrottleConfig) -> Self {
        Self {
            config,
            last_render_time: 0.0,
        }
    }

    /// 检查是否应该执行渲染
    pub fn should_render(&mut self) -> bool {
        if !self.config.enabled {
            return true;
        }

        let now = web_sys::window()
            .and_then(|win| win.performance())
            .map_or(0.0, |perf| perf.now());

        if now - self.last_render_time >= self.config.min_interval_ms {
            self.last_render_time = now;
            true
        } else {
            false
        }
    }

    /// 重置节流器
    pub fn reset(&mut self) {
        self.last_render_time = 0.0;
    }
}

impl Default for RenderThrottle {
    fn default() -> Self {
        Self::new(ThrottleConfig::default())
    }
}
