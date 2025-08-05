# K线服务鼠标事件命令模式重构设计文档

## 一、设计概述

### 1.1 重构目标

基于现有代码中的鼠标事件处理逻辑，引入命令模式来：
- 统一管理鼠标状态，解决状态分散问题
- 简化事件处理流程，提高代码可维护性
- 保持现有功能完全不变，只重构内部实现
- 为未来扩展奠定良好基础

### 1.2 设计原则

- **最小化改动**：只重构内部实现，保持所有对外接口不变
- **渐进式重构**：分阶段实施，确保每步都可验证
- **功能对等**：重构前后功能行为完全一致
- **保持性能**：不引入显著性能开销

## 二、现有事件分析

### 2.1 当前事件类型

经过代码分析，当前系统实现了以下7个核心事件：

| 事件类型 | 方法名 | 参数 | 返回值 | 主要功能 |
|---------|--------|------|--------|----------|
| 鼠标移动 | handle_mouse_move | x: f64, y: f64 | void | 更新hover状态，触发重绘 |
| 鼠标按下 | handle_mouse_down | x: f64, y: f64 | bool | 开始交互，返回是否处理 |
| 鼠标释放 | handle_mouse_up | x: f64, y: f64 | bool | 结束交互，返回是否处理 |
| 鼠标拖动 | handle_mouse_drag | x: f64, y: f64 | void | 持续交互，缩放/平移 |
| 鼠标离开 | handle_mouse_leave | - | bool | 清理状态，返回是否重绘 |
| 滚轮事件 | handle_wheel | delta: f64, x: f64, y: f64 | void | 缩放视图 |
| 光标查询 | get_cursor_style | x: f64, y: f64 | String | 返回光标样式 |

### 2.2 当前架构问题

1. **状态管理分散**
   - ChartRenderer管理hover_index、mouse_in_chart等状态
   - DataZoomRenderer管理is_dragging、drag_start_x等状态
   - 状态同步困难，容易出现不一致

2. **事件处理逻辑复杂**
   - ChartRenderer的handle_mouse_move方法超过80行
   - 混合了状态计算、事件转发、渲染触发等多重职责

3. **事件分发效率低**
   - StrategyFactory每次事件都遍历所有策略
   - 线性查找，无法快速定位处理器

## 三、命令模式设计

### 3.1 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    KlineProcess                         │
│                   (WASM 入口)                           │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                CommandManager                           │
│         (统一状态管理 + 事件协调)                       │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │   MouseState    │  │  ResultHandler  │              │
│  │                 │  │                 │              │
│  │ • position      │  │ • NeedRedraw    │              │
│  │ • hover_index   │  │ • DragResult    │              │
│  │ • is_dragging   │  │ • CursorStyle   │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│          StrategyFactory (保持不变)                     │
│        (现有事件分发逻辑)                               │
└─────────────────────────────────────────────────────────┘
```

### 3.2 命令定义

```rust
/// K线图命令枚举 - 只包含现有的事件类型
#[derive(Debug, Clone)]
pub enum KlineCommand {
    /// 鼠标移动事件
    MouseMove { x: f64, y: f64 },
    /// 鼠标按下事件
    MouseDown { x: f64, y: f64 },
    /// 鼠标释放事件
    MouseUp { x: f64, y: f64 },
    /// 鼠标拖动事件
    MouseDrag { x: f64, y: f64 },
    /// 鼠标离开事件
    MouseLeave,
    /// 滚轮事件
    Wheel { delta: f64, x: f64, y: f64 },
    /// 查询光标样式
    GetCursorStyle { x: f64, y: f64 },
}

/// 命令执行结果
#[derive(Debug, Clone, PartialEq)]
pub enum CommandResult {
    /// 无处理
    None,
    /// 事件已被处理
    Handled,
    /// 需要重绘
    NeedRedraw,
    /// 拖动结果（保持与现有DragResult兼容）
    DragResult(DragResult),
    /// 光标样式
    CursorStyle(CursorStyle),
    /// 布局需要更新
    LayoutChanged,
}
```

### 3.3 CommandManager设计

```rust
pub struct CommandManager {
    /// 共享状态引用
    shared_state: SharedRenderState,
    /// 统一的鼠标状态
    mouse_state: MouseState,
}

/// 鼠标状态集中管理
#[derive(Debug, Clone)]
pub struct MouseState {
    pub x: f64,
    pub y: f64,
    pub is_in_chart: bool,
    pub hover_index: Option<usize>,
    pub is_dragging: bool,
}
```

#### 3.3.1 核心方法

```rust
impl CommandManager {
    /// 事件处理入口方法
    pub fn handle_mouse_move(&mut self, x: f64, y: f64) -> CommandResult;
    pub fn handle_mouse_down(&mut self, x: f64, y: f64) -> CommandResult;
    pub fn handle_mouse_up(&mut self, x: f64, y: f64) -> CommandResult;
    pub fn handle_mouse_drag(&mut self, x: f64, y: f64) -> CommandResult;
    pub fn handle_mouse_leave(&mut self) -> CommandResult;
    pub fn handle_wheel(&mut self, delta: f64, x: f64, y: f64) -> CommandResult;
    pub fn get_cursor_style(&mut self, x: f64, y: f64) -> CursorStyle;
    
    /// 命令执行核心
    fn execute_command(&mut self, command: KlineCommand) -> CommandResult;
}
```

#### 3.3.2 状态管理优化

CommandManager将原来分散在多个组件的状态集中管理：

```rust
// 原来的状态分散在：
// ChartRenderer: hover_candle_index, mouse_in_chart, mouse_x, mouse_y
// DataZoomRenderer: is_dragging, drag_start_x, drag_handle_type

// 现在统一管理在CommandManager的MouseState中
```

### 3.4 事件处理流程

#### 3.4.1 鼠标移动处理流程

```rust
fn handle_mouse_move_impl(&mut self, x: f64, y: f64) -> CommandResult {
    // 1. 更新鼠标位置
    self.mouse_state.x = x;
    self.mouse_state.y = y;
    
    // 2. 检查是否在图表内（复用现有逻辑）
    let is_in_main_or_volume = self.check_in_chart_area(x, y);
    
    // 3. 计算hover索引（复用现有逻辑）
    let new_hover_index = self.calculate_hover_index(x, y, is_in_main_or_volume);
    
    // 4. 更新状态并检测变化
    let hover_changed = self.update_hover_state(new_hover_index);
    let in_chart_changed = self.update_in_chart_state(is_in_main_or_volume);
    
    // 5. 根据状态变化返回结果
    if hover_changed || in_chart_changed {
        CommandResult::NeedRedraw
    } else {
        CommandResult::Handled
    }
}
```

#### 3.4.2 鼠标按下处理流程

```rust
fn handle_mouse_down_impl(&mut self, x: f64, y: f64) -> CommandResult {
    // 1. 委托给StrategyFactory（保持现有逻辑）
    let mode = self.shared_state.render_mode;
    let ctx = self.create_render_context();
    let factory = RenderStrategyFactory::new();
    let handled = factory.handle_mouse_down(x, y, &ctx, mode);
    
    // 2. 更新拖动状态
    if handled {
        let navigator_rect = self.get_navigator_rect();
        if navigator_rect.contains(x, y) {
            self.mouse_state.is_dragging = true;
        }
        CommandResult::Handled
    } else {
        CommandResult::None
    }
}
```

### 3.5 与现有体系的兼容性与冲突分析

1. **接口层级**：CommandManager 仅在 `KlineProcess → ChartRenderer` 之间插入一层聚合逻辑，外部调用链保持不变。
2. **Trait 分发**：`RenderStrategyFactory` 继续负责基于 trait 的事件下发；CommandManager 在获得结果后仅负责解析是否需要重绘或更新布局，不拦截 trait 调度。
3. **DragResult 透传**：所有 `DragResult` 将被原样包裹在 `CommandResult::DragResult` 中向上层返回，确保与 DataZoomRenderer 等逻辑兼容。
4. **Hover 计算去重**：若某策略内部仍保留自有 hover 状态（例如十字线），CommandManager 的统一 hover 结果优先，并通过共享状态写回策略；如出现冲突，以渲染层表现为准。

### 3.6 脏标记与重新渲染决策

| 来源 | CommandResult | 统一动作 |
|-------|---------------|----------|
| Hover / 位置变化 | `NeedRedraw` | 调用 `ChartRenderer::set_overlay_dirty` 仅重绘覆盖层 |
| 布局变更 | `LayoutChanged` | 先 `ChartRenderer::set_all_dirty` 再重新布局 |
| DragResult(导航器) | `DragResult` | 若返回 `Changed`, 标记主图+覆盖层脏；若 `NoChange` 则忽略 |

示例：
```rust
match result {
    CommandResult::NeedRedraw => self.chart_renderer.set_overlay_dirty(),
    CommandResult::LayoutChanged | CommandResult::DragResult(DragResult::Changed) => {
        self.chart_renderer.set_all_dirty();
    }
    _ => {}
}
```

### 3.7 重复事件合并与节流策略

```rust
const MOUSEMOVE_THROTTLE_MS: u64 = 8; // ~120 FPS 上限
const MIN_MOVE_DELTA: f64 = 0.5;      // 像素阈值

pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
    let now = now_ms();
    if now - self.last_move_ts < MOUSEMOVE_THROTTLE_MS {
        return; // 丢弃
    }
    if (x - self.last_x).abs() < MIN_MOVE_DELTA && (y - self.last_y).abs() < MIN_MOVE_DELTA {
        return; // 小抖动
    }
    self.last_move_ts = now;
    self.last_x = x;
    self.last_y = y;
    let result = self.command_manager.handle_mouse_move(x, y);
    self.handle_command_result(result);
}
```

- **时间阈值** 控制帧率；可通过运行时配置或基准测试微调。
- **空间阈值** 避免鼠标抖动导致的无意义重绘。

### 3.8 潜在问题与对策

| 问题 | 影响 | 对策 |
|-------|-------|------|
| DataZoomRenderer 内拖动状态与 CommandManager 重复 | 拖动结束判定不一致 | 将拖动起止坐标保存至 CommandManager，通过引用传入策略 |
| 策略内部 hover 逻辑未迁移 | 双倍计算 | 在迁移阶段为策略提供统一 hover 数据接口，后续逐步移除冗余逻辑 |
| CommandManager 膨胀 | 可维护性下降 | 按事件类别拆分子模块，如 `hover.rs`, `drag.rs`，保持单文件 < 300 行 |
| 节流阈值过大导致延迟 | 交互卡顿 | 基准测试 + 用户体验反馈迭代调整 |

---

## 四、重构实施计划

### 4.1 第一阶段：基础架构（1天）

#### 4.1.1 创建命令模块结构

```
src/command/
├── mod.rs              // 模块导出
├── command.rs          // 命令定义
├── manager.rs          // 命令管理器
└── lib.rs              // 命令系统入口
```

#### 4.1.2 实现核心数据结构

1. 定义 `KlineCommand` 枚举
2. 定义 `CommandResult` 枚举
3. 定义 `MouseState` 结构体
4. 实现 `CommandManager` 基础框架

### 4.2 第二阶段：事件处理迁移（2天）

#### 4.2.1 迁移顺序

1. **鼠标移动事件**（最简单）
   - 实现状态管理和hover计算
   - 验证重绘触发逻辑

2. **鼠标按下/释放事件**
   - 集成StrategyFactory
   - 保持拖动状态管理

3. **鼠标拖动事件**
   - 集成DragResult处理
   - 验证拖动行为

4. **鼠标离开和滚轮事件**
   - 完成状态清理
   - 验证滚轮缩放

5. **光标样式查询**
   - 实现样式返回逻辑

#### 4.2.2 KlineProcess重构

```rust
// 重构前
pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
    if let Some(ref mut renderer) = self.chart_renderer {
        renderer.handle_mouse_move(x, y);
    }
}

// 重构后
pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
    let result = self.command_manager.handle_mouse_move(x, y);
    self.handle_command_result(result);
}
```

### 4.3 第三阶段：测试和优化（1天）

#### 4.3.1 功能验证

1. **单元测试**
   - 测试每个命令的处理逻辑
   - 验证状态管理的正确性

2. **集成测试**
   - 对比重构前后的行为
   - 验证所有交互功能

3. **性能测试**
   - 确保没有性能回归
   - 优化热点代码

#### 4.3.2 代码清理

1. 移除ChartRenderer中的重复状态
2. 简化事件处理方法
3. 更新文档注释

## 五、兼容性保证

### 5.1 接口兼容性

- **WASM接口完全不变**：所有公开方法签名保持一致
- **前端调用无需修改**：React组件和Web Worker代码不变
- **事件行为一致**：所有交互效果与重构前完全相同

### 5.2 内部兼容性

- **StrategyFactory保持不变**：继续使用现有的事件分发逻辑
- **所有渲染器保持不变**：DataZoomRenderer、OverlayRenderer等无需修改
- **DragResult保持不变**：确保与现有逻辑兼容

### 5.3 回滚机制

- 如果发现问题，可以快速回滚到原有实现
- 保留原有代码作为注释，便于对比
- 分阶段提交，每步都可独立验证

## 六、预期收益

### 6.1 代码质量提升

1. **状态管理统一**
   - 所有鼠标状态集中在CommandManager
   - 避免状态同步问题
   - 状态变更更可预测

2. **职责分离清晰**
   - CommandManager负责状态管理和事件协调
   - StrategyFactory负责事件分发
   - 各个渲染器负责具体处理逻辑

3. **代码可维护性**
   - 事件处理逻辑模块化
   - 便于定位和修复问题
   - 减少代码重复

### 6.2 性能优化

1. **减少重复计算**
   - hover索引计算优化
   - 状态缓存机制

2. **优化事件分发**
   - 快速判断事件目标
   - 减少不必要的遍历

### 6.3 扩展性

1. **便于添加新功能**
   - 新的交互可以通过扩展CommandManager实现
   - 命令模式支持撤销/重做等高级功能

2. **便于测试**
   - 每个命令可以独立测试
   - 模拟测试更加容易

## 七、风险评估

### 7.1 技术风险

- **风险**：状态管理迁移可能引入bug
- **缓解**：详细的状态对比测试，逐步迁移

- **风险**：性能可能受到影响
- **缓解**：性能基准测试，优化热点代码

### 7.2 进度风险

- **风险**：重构时间超出预期
- **缓解**：分阶段实施，每阶段都有可交付成果

### 7.3 质量风险

- **风险**：功能行为发生变化
- **缓解**：全面的测试覆盖，包括端到端测试

## 八、验收标准

### 8.1 功能验收

- [ ] 所有鼠标事件功能与重构前完全一致
- [ ] 光标样式显示正确
- [ ] 拖拽和缩放功能正常
- [ ] Hover效果和Tooltip显示正常
- [ ] 数据缩放导航器功能正常

### 8.2 性能验收

- [ ] 60FPS渲染性能保持不变
- [ ] 鼠标响应延迟 < 16ms
- [ ] 内存使用无显著增长

### 8.3 代码质量验收

- [ ] 代码通过所有lint检查
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试全部通过
- [ ] 代码文档完整

## 九、总结

本设计文档描述了一个基于命令模式的鼠标事件处理重构方案。该方案：

1. **保持现有功能不变**，只重构内部实现
2. **统一管理鼠标状态**，解决状态分散问题
3. **简化事件处理流程**，提高代码可维护性
4. **采用渐进式重构**，降低风险
5. **为未来扩展奠定基础**，支持更多交互功能

通过这个重构，K线服务的代码质量将得到显著提升，同时保持完全的向后兼容性。