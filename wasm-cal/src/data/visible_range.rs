// wasm-cal/src/data/visible_range.rs
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartLayout, theme::*}; // Added theme import

// ... (VisibleRange struct and other methods remain the same) ...
#[derive(Debug, Clone, Copy)]
pub struct VisibleRange {
    start: usize,
    count: usize,
    end: usize,
    total_len: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct DataRange {
    pub min_low: f64,
    pub max_high: f64,
    pub max_volume: f64,
}

impl DataRange {
    pub fn new() -> Self {
        Self {
            min_low: 0.0,
            max_high: 0.0,
            max_volume: 0.0,
        }
    }
    pub fn get(&self) -> (f64, f64, f64) {
        (self.min_low, self.max_high, self.max_volume)
    }
}

impl VisibleRange {
    pub fn new(start: usize, count: usize, total_len: usize) -> Self {
        let count = count.max(1).min(total_len); 
        let start = start.min(total_len.saturating_sub(count)); 
        let end = (start + count).min(total_len); 
        Self { start, count, end, total_len }
    }

    pub fn from_layout(layout: &ChartLayout, items_len: usize) -> Self {
        if items_len == 0 {
            return Self::new(0, 0, 0);
        }
        let initial_visible_count = if layout.total_candle_width > 0.0 {
             ((layout.main_chart_width / layout.total_candle_width).floor() as usize)
                .max(1) 
                .min(items_len)
        } else {
            items_len.min(100) // Fallback if total_candle_width is 0, show up to 100 items
        };
        let start = items_len.saturating_sub(initial_visible_count);
        Self::new(start, initial_visible_count, items_len)
    }
    
    pub fn update(&mut self, start: usize, count: usize) -> bool {
        let old_start = self.start;
        let old_count = self.count;
        let count = count.max(1).min(self.total_len); 
        let start = start.min(self.total_len.saturating_sub(count)); 
        let end = (start + count).min(self.total_len); 
        self.start = start;
        self.count = count;
        self.end = end;
        old_start != start || old_count != count
    }

    pub fn update_total_len(&mut self, new_total_len: usize) -> bool {
        if self.total_len == new_total_len { return false; }
        let old_start = self.start;
        let old_count = self.count;
        self.total_len = new_total_len;
        let count = self.count.max(1).min(new_total_len); 
        let start = self.start.min(new_total_len.saturating_sub(count)); 
        let end = (start + count).min(new_total_len); 
        self.start = start;
        self.count = count;
        self.end = end;
        old_start != start || old_count != count
    }

    pub fn get_range(&self) -> (usize, usize, usize) {
        (self.start, self.count, self.end)
    }

    pub fn get_screen_coordinates(&self, layout: &ChartLayout) -> (f64, f64) {
        // This method was defined in ChartLayout in the original structure.
        // Assuming it's moved here or ChartLayout provides a similar utility.
        // For now, let's use the logic from ChartLayout's calculate_visible_range_coordinates
        // if items_len is self.total_len, visible_start_index is self.start, visible_count is self.count
        if self.total_len == 0 {
            return (layout.chart_area_x, layout.chart_area_x + layout.main_chart_width);
        }
        let nav_candle_width = layout.main_chart_width / self.total_len as f64;
        let visible_start_x = layout.chart_area_x + self.start as f64 * nav_candle_width;
        let visible_end_x = layout.chart_area_x + (self.start + self.count) as f64 * nav_candle_width;
        (visible_start_x, visible_end_x)
    }
    
    pub fn zoom_with_relative_position(&self, zoom_factor: f64, relative_position: f64) -> (usize, usize) {
        let relative_position = relative_position.clamp(0.0, 1.0);
        let visible_count = self.count.max(1);
        let visible_center_idx = self.start as f64 + (visible_count as f64 * relative_position);
        let new_visible_count = ((visible_count as f64 * zoom_factor).round() as usize).max(1).min(self.total_len);
        let new_start = ((visible_center_idx - (new_visible_count as f64 * relative_position)).round() as isize)
            .max(0).min((self.total_len.saturating_sub(new_visible_count)) as isize) as usize;
        (new_start, new_visible_count)
    }

    pub fn handle_wheel(&self, mouse_x: f64, chart_area_x: f64, chart_area_width: f64, delta: f64) -> (usize, usize) {
        let relative_position = if chart_area_width > 0.0 {
            ((mouse_x - chart_area_x) / chart_area_width).clamp(0.0, 1.0)
        } else { 0.5 }; 
        let zoom_factor = if delta > 0.0 { 0.8 } else { 1.25 }; 
        self.zoom_with_relative_position(zoom_factor, relative_position)
    }

    pub fn calculate_data_ranges(
        &self,
        items: &flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<KlineItem<'_>>>,
    ) -> DataRange {
        if items.is_empty() || self.start >= self.end || self.count == 0 {
            return DataRange::new();
        }

        let (min_low, max_high, max_volume) = (self.start..self.end).fold(
            (f64::MAX, f64::MIN, 0.0_f64),
            |(min_l, max_h, max_v), idx| { // Renamed to avoid conflict
                if idx >= items.len() { return (min_l, max_h, max_v); } 
                let item = items.get(idx);
                (min_l.min(item.low()), max_h.max(item.high()), max_v.max(item.b_vol() + item.s_vol()))
            },
        );
        
        let (final_min_low, final_max_high) = if (max_high - min_low).abs() < MIN_PRICE_DIFF_THRESHOLD {
            (min_low - VISIBLE_RANGE_DEFAULT_PRICE_BUFFER / 2.0, max_high + VISIBLE_RANGE_DEFAULT_PRICE_BUFFER / 2.0)
        } else {
            let price_range = max_high - min_low;
            let buffer = price_range * VISIBLE_RANGE_PRICE_BUFFER_PERCENT;
            (min_low - buffer, max_high + buffer)
        };

        let final_max_volume = if max_volume == 0.0 {
            VISIBLE_RANGE_DEFAULT_MAX_VOLUME
        } else {
            max_volume * VISIBLE_RANGE_VOLUME_BUFFER_PERCENT
        };

        DataRange {
            min_low: final_min_low,
            max_high: final_max_high,
            max_volume: final_max_volume,
        }
    }

    pub fn precompute_x_coordinates(&self, layout: &ChartLayout) -> Vec<f64> {
        let mut x_coords = Vec::with_capacity(self.count);
        let x_max = layout.chart_area_x + layout.main_chart_width;
        for i in 0..self.count { 
            let global_index = self.start + i;
            if global_index < self.total_len { 
                 let x = layout.map_index_to_x(global_index, self.start); 
                 if (x <= x_max + layout.total_candle_width) || (x_coords.is_empty() && i == 0) {
                    x_coords.push(x);
                }
            }
        }
        x_coords
    }
}
