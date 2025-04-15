//! KlineProcess模块 - 持有K线数据和三层Canvas，提供统一的绘制函数
use crate::ChartRenderer;
use crate::kline_generated::kline::{KlineData, root_as_kline_data_with_opts};
use crate::layout::ChartLayout;
use crate::utils::WasmError;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

// --- Logging Helpers (moved from lib.rs) ---
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
    #[wasm_bindgen(js_namespace = console, js_name = time)]
    fn time(label: &str);
    #[wasm_bindgen(js_namespace = console, js_name = timeEnd)]
    fn time_end(label: &str);
}

/// KlineProcess - 持有K线数据和渲染器，提供统一的绘制函数
#[wasm_bindgen]
pub struct KlineProcess {
    // 数据相关
    data: Vec<u8>, // 原始FlatBuffer数据
    // 渲染器
    chart_renderer: Option<ChartRenderer>,
    // 缓存的计算结果
    min_low: f64,    // 最低价
    max_high: f64,   // 最高价
    min_volume: f64, // 最小成交量
    max_volume: f64, // 最大成交量
}

#[wasm_bindgen]
impl KlineProcess {
    /// 创建新的KlineProcess实例
    #[wasm_bindgen(constructor)]
    pub fn new(
        memory_val: JsValue,
        ptr_offset: usize,
        data_length: usize,
    ) -> Result<KlineProcess, JsValue> {
        log(&format!(
            "KlineProcess::new - Reading WASM memory: offset={}, length={}",
            ptr_offset, data_length
        ));

        // 1. 从WASM内存中读取数据
        let data = Self::read_from_memory(memory_val, ptr_offset, data_length)?;

        // 2. 验证数据
        Self::verify_kline_data_slice(&data)?; // 现在可以直接使用 ? 操作符

        // 5. 解析数据并计算范围（初始）
        let parsed_data = Self::parse_kline_data_from_slice(&data)?;
        let (min_low, max_high, max_volume) = Self::calculate_data_ranges(&parsed_data)?;

        log("KlineProcess initialized successfully.");

        Ok(KlineProcess {
            data,
            chart_renderer: None,
            min_low,
            max_high,
            min_volume: 0.0,
            max_volume,
        })
    }

    /// 设置三层Canvas
    #[wasm_bindgen]
    pub fn set_canvases(
        &mut self,
        base_canvas: OffscreenCanvas,
        main_canvas: OffscreenCanvas,
        overlay_canvas: OffscreenCanvas,
    ) -> Result<(), JsValue> {
        // 获取Canvas尺寸
        let width = base_canvas.width() as f64;
        let height = base_canvas.height() as f64;
        // 创建布局
        let layout = ChartLayout::new(width, height);
        // 创建渲染器
        let chart_renderer =
            ChartRenderer::new(&base_canvas, &main_canvas, &overlay_canvas, layout)?;
        self.chart_renderer = Some(chart_renderer);

        Ok(())
    }

    /// 绘制所有图表
    #[wasm_bindgen]
    pub fn draw_all(&self) -> Result<(), JsValue> {
        time("KlineProcess::draw_all");
        // 解析数据 ON THE FLY for drawing
        let parsed_data = self.parse_kline_data()?;

        // 获取K线数据项
        let items = parsed_data
            .items()
            .ok_or_else(|| WasmError::ParseError("无K线数据项".into()))?;

        // 使用ChartRenderer绘制所有图表
        match &self.chart_renderer {
            Some(chart_renderer) => {
                chart_renderer.render(items);
            }
            None => {
                return Err(WasmError::RenderError("未设置Canvas".into()).into());
            }
        }
        time_end("KlineProcess::draw_all");
        Ok(())
    }

    /// 从WASM内存中读取数据
    fn read_from_memory(
        memory_val: JsValue,
        ptr_offset: usize,
        data_length: usize,
    ) -> Result<Vec<u8>, JsValue> {
        // Cast JsValue to WebAssembly::Memory
        let memory = memory_val
            .dyn_into::<js_sys::WebAssembly::Memory>()
            .map_err(|_| {
                WasmError::BufferError("无法将提供的 JSValue 转换为 WebAssembly.Memory".into())
            })?;

        let buffer = memory.buffer();
        let memory_view = js_sys::Uint8Array::new_with_byte_offset_and_length(
            &buffer,
            ptr_offset as u32,  // Cast offset to u32
            data_length as u32, // Cast length to u32
        );

        let data = memory_view.to_vec();
        if data.len() != data_length {
            return Err(WasmError::BufferError("Memory copy length mismatch".into()).into());
        }

        Ok(data)
    }

    /// 验证FlatBuffer数据
    fn verify_kline_data_slice(bytes: &[u8]) -> Result<(), WasmError> {
        if bytes.len() < 8 {
            return Err(WasmError::ValidationError("FlatBuffer数据长度不足".into()));
        }

        let identifier = String::from_utf8_lossy(&bytes[4..8]);
        if identifier != crate::kline_generated::kline::KLINE_DATA_IDENTIFIER {
            return Err(WasmError::ValidationError(format!(
                "无效的FlatBuffer标识符, 期望: {}, 实际: {}",
                crate::kline_generated::kline::KLINE_DATA_IDENTIFIER,
                identifier
            )));
        }

        Ok(())
    }

    /// 解析K线数据
    fn parse_kline_data(&self) -> Result<KlineData, WasmError> {
        let bytes: &Vec<u8> = &self.data;
        Self::verify_kline_data_slice(bytes)?;
        let mut opts = flatbuffers::VerifierOptions::default();
        opts.max_tables = 1_000_000_000;
        root_as_kline_data_with_opts(&opts, bytes)
            .map_err(|e| WasmError::ParseError(format!("Flatbuffer 解析失败: {}", e)))
    }

    // Helper function to parse from a slice, avoiding borrow issues
    fn parse_kline_data_from_slice(data: &[u8]) -> Result<KlineData, WasmError> {
        Self::verify_kline_data_slice(data)?;
        let mut opts = flatbuffers::VerifierOptions::default();
        opts.max_tables = 1_000_000_000;
        root_as_kline_data_with_opts(&opts, data)
            .map_err(|e| WasmError::ParseError(format!("Flatbuffer 解析失败: {}", e)))
    }

    /// 计算价格和成交量范围 (static method, operates on parsed data)
    fn calculate_data_ranges(parsed_data: &KlineData<'_>) -> Result<(f64, f64, f64), WasmError> {
        let items = parsed_data
            .items()
            .ok_or_else(|| WasmError::ParseError("无法获取 K 线数据项".into()))?;

        if items.is_empty() {
            return Ok((0.0, 0.0, 0.0)); // Return default values for empty data
        }

        let mut min_low = f64::MAX;
        let mut max_high = f64::MIN;
        // 修复 max_volume.max(volume) 类型歧义问题

        // 改为:
        let mut max_volume: f64 = 0.0;

        for item in items.iter() {
            min_low = min_low.min(item.low());
            max_high = max_high.max(item.high());
            let volume = item.b_vol() + item.s_vol();
            max_volume = max_volume.max(volume);
        }

        // Add buffer for better visualization
        let price_range = max_high - min_low;
        // Handle potential case where min_low == max_high
        if price_range > 0.0 {
            min_low -= price_range * 0.05; // 5% buffer below
            max_high += price_range * 0.05; // 5% buffer above
        } else {
            // Add a small fixed buffer if range is zero
            min_low -= 1.0;
            max_high += 1.0;
        }
        // Ensure max_volume has a minimum value if all volumes are 0
        if max_volume == 0.0 {
            max_volume = 1.0;
        }

        Ok((min_low, max_high, max_volume))
    }
}
