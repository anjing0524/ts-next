//! src/command/event.rs
/// 原始输入事件的轻量级枚举，仅用于传递给CommandManager
#[derive(Debug, Clone, Copy)]
pub enum Event {
    MouseMove { x: f64, y: f64 },
    MouseDown { x: f64, y: f64 },
    MouseUp { x: f64, y: f64 },
    MouseLeave,
    Wheel { delta: f64, x: f64, y: f64 },
}
