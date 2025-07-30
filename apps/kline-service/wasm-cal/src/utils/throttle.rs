//! 渲染节流模块 - 提供基于计数器的简单节流机制

use std::cell::Cell;

// 使用 thread_local 存储计数器，避免频繁重绘
thread_local! {
    static RENDER_COUNTER: Cell<u32> = Cell::new(0);
    static MOUSE_MOVE_COUNTER: Cell<u32> = Cell::new(0);
}

/// 渲染节流配置
pub struct ThrottleConfig {
    /// 渲染节流频率（每N次调用执行一次），默认3
    pub render_frequency: u32,
    /// 鼠标移动节流频率（每N次调用执行一次），默认2
    pub mouse_move_frequency: u32,
}

impl Default for ThrottleConfig {
    fn default() -> Self {
        Self {
            render_frequency: 3,     // 每3次调用执行一次渲染
            mouse_move_frequency: 2, // 每2次调用执行一次鼠标移动处理
        }
    }
}

/// 渲染节流器
pub struct RenderThrottle;

impl RenderThrottle {
    /// 检查是否应该执行渲染
    ///
    /// # 参数
    /// * `config` - 节流配置
    ///
    /// # 返回值
    /// 如果应该渲染返回 true，否则返回 false
    pub fn should_render(config: &ThrottleConfig) -> bool {
        RENDER_COUNTER.with(|counter| {
            let current = counter.get();
            let next = (current + 1) % config.render_frequency;
            counter.set(next);
            next == 0
        })
    }

    /// 检查是否应该处理鼠标移动事件
    ///
    /// # 参数
    /// * `config` - 节流配置
    ///
    /// # 返回值
    /// 如果应该处理返回 true，否则返回 false
    pub fn should_handle_mouse_move(config: &ThrottleConfig) -> bool {
        MOUSE_MOVE_COUNTER.with(|counter| {
            let current = counter.get();
            let next = (current + 1) % config.mouse_move_frequency;
            counter.set(next);
            next == 0
        })
    }

    /// 强制重置渲染计数器，用于强制下次渲染
    pub fn force_reset_render_counter() {
        RENDER_COUNTER.with(|counter| {
            counter.set(0);
        });
    }

    /// 强制重置鼠标移动计数器
    pub fn force_reset_mouse_counter() {
        MOUSE_MOVE_COUNTER.with(|counter| {
            counter.set(0);
        });
    }

    /// 获取当前渲染计数器值（用于调试）
    pub fn get_render_counter() -> u32 {
        RENDER_COUNTER.with(|counter| counter.get())
    }

    /// 获取当前鼠标移动计数器值（用于调试）
    pub fn get_mouse_counter() -> u32 {
        MOUSE_MOVE_COUNTER.with(|counter| counter.get())
    }
}

/// 便捷的渲染节流宏
///
/// # 示例
/// ```rust
/// use crate::utils::throttle::{throttle_render, ThrottleConfig};
///
/// let config = ThrottleConfig::default();
/// throttle_render!(config, {
///     // 这里的代码只有在满足节流条件时才会执行
///     expensive_render_operation();
/// });
/// ```
#[macro_export]
macro_rules! throttle_render {
    ($config:expr, $block:block) => {
        if $crate::utils::throttle::RenderThrottle::should_render($config) {
            $block
        }
    };
}

/// 便捷的鼠标移动节流宏
#[macro_export]
macro_rules! throttle_mouse_move {
    ($config:expr, $block:block) => {
        if $crate::utils::throttle::RenderThrottle::should_handle_mouse_move($config) {
            $block
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_throttle_config_default() {
        let config = ThrottleConfig::default();
        assert_eq!(config.render_frequency, 3);
        assert_eq!(config.mouse_move_frequency, 2);
    }

    #[test]
    fn test_render_throttle() {
        let config = ThrottleConfig {
            render_frequency: 3,
            mouse_move_frequency: 2,
        };

        // 重置计数器
        RenderThrottle::force_reset_render_counter();

        // 前两次调用应该返回 false
        assert_eq!(RenderThrottle::should_render(&config), false);
        assert_eq!(RenderThrottle::should_render(&config), false);
        // 第三次调用应该返回 true
        assert_eq!(RenderThrottle::should_render(&config), true);
        // 循环重复
        assert_eq!(RenderThrottle::should_render(&config), false);
        assert_eq!(RenderThrottle::should_render(&config), false);
        assert_eq!(RenderThrottle::should_render(&config), true);
    }

    #[test]
    fn test_mouse_move_throttle() {
        let config = ThrottleConfig {
            render_frequency: 3,
            mouse_move_frequency: 2,
        };

        // 重置计数器
        RenderThrottle::force_reset_mouse_counter();

        // 第一次调用应该返回 false
        assert_eq!(RenderThrottle::should_handle_mouse_move(&config), false);
        // 第二次调用应该返回 true
        assert_eq!(RenderThrottle::should_handle_mouse_move(&config), true);
        // 循环重复
        assert_eq!(RenderThrottle::should_handle_mouse_move(&config), false);
        assert_eq!(RenderThrottle::should_handle_mouse_move(&config), true);
    }

    #[test]
    fn test_force_reset() {
        RenderThrottle::force_reset_render_counter();
        assert_eq!(RenderThrottle::get_render_counter(), 0);

        RenderThrottle::force_reset_mouse_counter();
        assert_eq!(RenderThrottle::get_mouse_counter(), 0);
    }
}
