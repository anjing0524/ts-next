//! 数据处理模块 - 负责处理K线数据和技术指标计算

pub mod data_manager;
pub mod visible_range;

pub use data_manager::DataManager;
pub use visible_range::{DataRange, VisibleRange};
