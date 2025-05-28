# 图表配置系统

这个配置系统允许您通过外部配置文件或代码来自定义图表的交易对名称、颜色主题等设置。

## 特性

- ✅ 可配置的交易对符号和标题
- ✅ 内置亮色和暗色主题
- ✅ 完全自定义的主题配置
- ✅ JSON 配置文件支持
- ✅ 运行时配置更新
- ✅ 多语言支持预留

## 使用方法

### 1. 基础配置

```rust
use kline_processor::{ChartConfig, ChartRenderer};

// 创建配置
let config = ChartConfig {
    symbol: "ETH/USDT".to_string(),
    theme: "dark".to_string(),
    title: Some("以太坊/USDT".to_string()),
    language: "zh-CN".to_string(),
    custom_theme: None,
};

// 使用配置创建渲染器
let renderer = ChartRenderer::new_with_config(
    &base_canvas,
    &main_canvas, 
    &overlay_canvas,
    layout,
    parsed_data,
    config
)?;
```

### 2. 从JSON文件加载配置

```rust
// 读取配置文件
let config_json = std::fs::read_to_string("config.json")?;

// 创建渲染器并加载配置
let mut renderer = ChartRenderer::new(/* 参数 */)?;
renderer.load_config_from_json(&config_json)?;
```

### 3. 运行时更新配置

```rust
// 更改交易对
renderer.set_symbol("BTC/USDT".to_string());

// 切换主题
renderer.set_theme("light".to_string());

// 设置自定义主题
let custom_theme = ChartTheme {
    background: "#1a1a1a".to_string(),
    text: "#ffffff".to_string(),
    // ... 其他颜色配置
};
renderer.set_custom_theme(custom_theme);

// 重新渲染以应用更改
renderer.render();
```

## 配置文件格式

### 基础配置 (config.light.json)

```json
{
  "symbol": "BTC/USDT",
  "theme": "light", 
  "title": "比特币/USDT",
  "language": "zh-CN"
}
```

### 自定义主题配置 (config.example.json)

```json
{
  "symbol": "ETH/USDT",
  "theme": "dark",
  "title": "以太坊/USDT", 
  "language": "zh-CN",
  "custom_theme": {
    "background": "#1a1a1a",
    "header_bg": "#2d2d2d",
    "border": "#404040",
    "grid": "#333333",
    "text": "#ffffff",
    "axis_text": "#cccccc",
    "bullish": "#00ff88",
    "bearish": "#ff4757",
    "last_price_line": "#ffa726",
    "bid_price_line": "#00ff88", 
    "ask_price_line": "#ff4757",
    "navigator_bg": "#2d2d2d",
    "navigator_handle": "#606060",
    "navigator_active_handle": "#5c7cfa",
    "navigator_mask": "rgba(50, 50, 50, 0.5)",
    "navigator_border": "#404040",
    "navigator_active_handle_shadow": "rgba(92, 124, 250, 0.6)",
    "volume_line": "#5794f2",
    "volume_area": "rgba(87, 148, 242, 0.2)",
    "crosshair": "rgba(200, 200, 200, 0.5)",
    "tooltip_bg": "rgba(45, 45, 45, 0.95)",
    "tooltip_border": "#606060",
    "tooltip_text": "#ffffff",
    "switch_bg": "#404040", 
    "switch_active_bg": "#505050",
    "switch_border": "#606060",
    "switch_text": "#cccccc",
    "switch_active_text": "#ffffff",
    "shadow": "rgba(0, 0, 0, 0.8)",
    "book_hover_bg": "rgba(80, 80, 80, 0.3)",
    "book_hover_border": "rgba(160, 160, 160, 0.8)"
  }
}
```

## 内置主题

### light (亮色主题)
- 白色背景
- 深色文字
- 绿色上涨，红色下跌

### dark (暗色主题) 
- 深色背景
- 浅色文字
- 亮绿色上涨，亮红色下跌

### high-contrast (高对比度主题)
- 黑白配色
- 适用于可访问性需求

## 颜色配置说明

| 配置项 | 说明 |
|--------|------|
| `background` | 画布背景色 |
| `header_bg` | 顶部区域背景色 |
| `border` | 边框颜色 |
| `grid` | 网格线颜色 |
| `text` | 主要文本颜色 |
| `axis_text` | 坐标轴文本颜色 |
| `bullish` | 上涨K线颜色 |
| `bearish` | 下跌K线颜色 |
| `last_price_line` | 最新价线颜色 |
| `bid_price_line` | 买一价线颜色 |
| `ask_price_line` | 卖一价线颜色 |
| `volume_line` | 成交量曲线颜色 |
| `volume_area` | 成交量区域填充颜色 |
| `crosshair` | 十字线颜色 |
| `tooltip_bg` | 提示框背景颜色 |
| `tooltip_border` | 提示框边框颜色 |
| `tooltip_text` | 提示框文本颜色 |

## 最佳实践

1. **主题一致性**: 确保所有颜色在视觉上协调一致
2. **对比度**: 保证文本和背景有足够的对比度以确保可读性
3. **颜色语义**: 遵循通用的颜色语义（如绿色表示上涨，红色表示下跌）
4. **配置验证**: 在生产环境中验证配置文件的有效性
5. **缓存配置**: 对于频繁更新的场景，考虑缓存解析后的配置对象

## 未来扩展

- 国际化支持
 