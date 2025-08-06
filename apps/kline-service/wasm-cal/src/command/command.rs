//! src/command/command.rs
/// 指令枚举，代表具体的业务意图
#[derive(Debug, Clone, Copy)]
pub enum Command {
    UpdateHover { x: f64, y: f64 },
    StartDrag { x: f64, y: f64 },
    EndDrag { x: f64, y: f64 },
    Drag { x: f64, y: f64 },
    ClearHover,
    Zoom { delta: f64, x: f64, y: f64 },
}
