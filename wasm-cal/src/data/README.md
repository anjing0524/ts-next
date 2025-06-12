# 数据管理架构

本文档描述了图表组件中的数据管理架构，重点关注可见范围的管理和数据计算的设计。

## 架构概述

数据管理架构由两个主要组件组成：

1. **VisibleRange** - 负责封装和管理可见数据范围的计算
2. **DataManager** - 负责管理K线数据和使用VisibleRange进行范围操作

这种设计实现了关注点分离，将数据范围计算与数据管理分开，提高了代码的可维护性和性能。

## VisibleRange

`VisibleRange` 类负责：

- 维护可见数据的起始索引、数量和结束索引
- 提供安全的边界检查和范围计算
- 处理缩放、移动等操作
- 计算可见区域的数据范围（最低价、最高价、最大成交量）

主要方法：

- `new()` - 创建新的可见范围
- `from_layout()` - 基于图表布局创建可见范围
- `update()` - 更新可见范围
- `update_total_len()` - 更新数据总长度
- `move_left()/move_right()` - 移动可见范围
- `zoom_in()/zoom_out()` - 缩放可见范围
- `handle_wheel()` - 处理鼠标滚轮事件
- `calculate_data_ranges()` - 计算可见数据的范围

## DataManager

`DataManager` 类负责：

- 管理K线数据
- 维护可见范围状态（使用VisibleRange）
- 缓存数据范围计算结果以提高性能
- 处理用户交互事件

主要方法：

- `set_items()` - 设置K线数据
- `initialize_visible_range()` - 根据布局初始化可见范围
- `update_visible_range()` - 更新可见范围
- `calculate_data_ranges()` - 计算并缓存数据范围
- `handle_wheel()` - 处理鼠标滚轮事件

## 优化设计

1. **计算缓存** - 数据范围计算结果被缓存，只在可见范围变化时重新计算
2. **防抖处理** - 滚轮事件进行了防抖处理，避免频繁计算
3. **边界安全** - 所有范围计算都包含边界检查，确保不会发生越界
4. **高内聚** - 每个组件专注于单一职责
5. **低耦合** - 组件之间通过明确的接口交互

## 使用示例

```rust
// 创建数据管理器
let mut data_manager = DataManager::new();

// 设置数据
data_manager.set_items(items);

// 初始化可见范围
data_manager.initialize_visible_range(&layout);

// 获取可见范围
let (start, count, end) = data_manager.get_visible();

// 计算数据范围
let (min_low, max_high, max_volume) = data_manager.calculate_data_ranges();
```

这种架构设计使得代码更加清晰、可维护，并且提高了性能。
