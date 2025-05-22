// wasm-cal/src/layout/mod.rs
pub mod chart_layout;
pub mod colors;
pub mod font;
pub mod theme; // Added

pub use chart_layout::ChartLayout;
pub use colors::ChartColors;
pub use font::ChartFont;
// pub use theme::*; // Optional: to re-export all theme constants
