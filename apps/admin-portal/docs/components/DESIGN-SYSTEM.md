# 🎨 Admin Portal 设计系统

**最后更新**: 2025-12-02
**版本**: 1.0
**状态**: ✅ 已实施 (Phase 1-7)

---

## 📖 概述

### 设计理念
**未来科技美学** - 为专业管理后台设计的现代化、科技感界面系统。强调清晰的数据展示、直观的交互和优雅的视觉层次。

### 核心原则
1. **一致性**: 统一的视觉语言贯穿所有组件
2. **可用性**: 直观的交互和清晰的视觉反馈
3. **性能**: 轻量级实现和优化的渲染性能
4. **可访问性**: 完整的无障碍支持和键盘导航
5. **扩展性**: 模块化设计和可配置的主题系统

### 设计定位
- **目标用户**: 系统管理员、技术操作人员
- **使用场景**: 日常系统管理、监控、配置操作
- **技术环境**: 现代浏览器、高分辨率显示器、可变网络条件

---

## 🎨 设计 Token

### 1. 颜色系统

#### 1.1 语义化颜色

**主色调 (Primary)**
```css
primary-50:  #f0f9ff  /* 最浅 */
primary-100: #e0f2fe
primary-200: #bae6fd
primary-300: #7dd3fc
primary-400: #38bdf8
primary-500: #0ea5e9  /* 基准色 */
primary-600: #0284c7
primary-700: #0369a1
primary-800: #075985
primary-900: #0c4a6e  /* 最深 */
```

**使用指南**:
- `primary-500`: 主要操作按钮、重要元素
- `primary-200`: 悬停状态、次要元素
- `primary-50`: 背景色、高亮区域

**成功状态 (Success)**
```css
success-50:  #ecfdf5
success-100: #d1fae5
success-200: #a7f3d0
success-300: #6ee7b7
success-400: #34d399
success-500: #10b981  /* 基准色 */
success-600: #059669
success-700: #047857
success-800: #065f46
success-900: #064e3b
```

**使用场景**: 成功消息、完成状态、积极指标

**警告状态 (Warning)**
```css
warning-50:  #fffbeb
warning-100: #fef3c7
warning-200: #fde68a
warning-300: #fcd34d
warning-400: #fbbf24
warning-500: #f59e0b  /* 基准色 */
warning-600: #d97706
warning-700: #b45309
warning-800: #92400e
warning-900: #78350f
```

**使用场景**: 警告消息、需要注意的状态、待处理操作

**错误状态 (Error)**
```css
error-50:  #fef2f2
error-100: #fee2e2
error-200: #fecaca
error-300: #fca5a5
error-400: #f87171
error-500: #ef4444  /* 基准色 */
error-600: #dc2626
error-700: #b91c1c
error-800: #991b1b
error-900: #7f1d1d
```

**使用场景**: 错误消息、危险操作、失败状态

**信息状态 (Info)**
```css
info-50:  #eff6ff
info-100: #dbeafe
info-200: #bfdbfe
info-300: #93c5fd
info-400: #60a5fa
info-500: #3b82f6  /* 基准色 */
info-600: #2563eb
info-700: #1d4ed8
info-800: #1e40af
info-900: #1e3a8a
```

**使用场景**: 信息性消息、提示、中性状态

#### 1.2 数据可视化调色板

**Viridis 调色板** (科学可视化)
```css
viridis-50:  #f7fcfd
viridis-100: #e0f3db
viridis-200: #ccebc5
viridis-300: #a8ddb5
viridis-400: #7bccc4
viridis-500: #4eb3d3
viridis-600: #2b8cbe
viridis-700: #0868ac
viridis-800: #084081
viridis-900: #081d58
```

**使用场景**: 图表、数据可视化、热力图

#### 1.3 中性颜色

**灰度 (Gray)**
```css
gray-50:  #f9fafb
gray-100: #f3f4f6
gray-200: #e5e7eb
gray-300: #d1d5db
gray-400: #9ca3af
gray-500: #6b7280  /* 基准色 */
gray-600: #4b5563
gray-700: #374151
gray-800: #1f2937
gray-900: #111827
```

**使用场景**: 文本、边框、背景、禁用状态

#### 1.4 颜色对比度要求
所有文本颜色必须满足 WCAG AA 标准:
- **正常文本**: 对比度 ≥ 4.5:1
- **大文本**: 对比度 ≥ 3:1
- **交互元素**: 对比度 ≥ 3:1

### 2. 字体系统

#### 2.1 字体家族

**显示字体 (Display)**
```css
font-family: 'Space Grotesk', system-ui, sans-serif;
```
- **用途**: 主标题、品牌标识、重要数字
- **特征**: 几何形状、科技感、高可读性

**正文字体 (Body)**
```css
font-family: 'Inter', system-ui, sans-serif;
```
- **用途**: 正文内容、表单标签、描述文本
- **特征**: 人性化、高可读性、多语言支持

**等宽字体 (Mono)**
```css
font-family: 'Fira Code', monospace;
```
- **用途**: 代码片段、技术标识、数据展示
- **特征**: 编程连字、清晰的可区分性

**数据字体 (Data)**
```css
font-family: 'Clash Display', sans-serif;
```
- **用途**: 数据仪表板、统计数字、关键指标
- **特征**: 高冲击力、数字优化

#### 2.2 排版比例

**基础字体大小**: 16px (1rem)

**排版比例**: 1.250 (Major Third)

| 层级 | 字体大小 | 行高 | 字重 | 使用场景 |
|------|----------|------|------|----------|
| **Display 2xl** | 3.815rem (61px) | 1.2 | 700 | 页面主标题 |
| **Display xl** | 3.052rem (49px) | 1.2 | 700 | 章节标题 |
| **Display lg** | 2.441rem (39px) | 1.3 | 600 | 卡片标题 |
| **Display md** | 1.953rem (31px) | 1.3 | 600 | 小标题 |
| **Display sm** | 1.563rem (25px) | 1.4 | 600 | 模块标题 |
| **Text xl** | 1.25rem (20px) | 1.5 | 400 | 大正文 |
| **Text lg** | 1rem (16px) | 1.6 | 400 | 基础正文 |
| **Text md** | 0.875rem (14px) | 1.6 | 400 | 小正文 |
| **Text sm** | 0.75rem (12px) | 1.5 | 400 | 辅助文本 |
| **Text xs** | 0.625rem (10px) | 1.4 | 400 | 微小文本 |

#### 2.3 字重系统
- **Light (300)**: 次要文本、标签
- **Normal (400)**: 正文内容、默认字重
- **Medium (500)**: 强调文本、子标题
- **Semibold (600)**: 标题、重要元素
- **Bold (700)**: 主标题、关键数据

### 3. 间距系统

#### 3.1 基础间距单位
**基础单位**: 0.25rem (4px)

| 名称 | 值 | 像素 | 使用场景 |
|------|-----|------|----------|
| **0** | 0 | 0px | 无间距 |
| **px** | 1px | 1px | 边框、细线 |
| **0.5** | 0.125rem | 2px | 微小间距 |
| **1** | 0.25rem | 4px | 基础单位 |
| **1.5** | 0.375rem | 6px | 紧凑间距 |
| **2** | 0.5rem | 8px | 标准内边距 |
| **2.5** | 0.625rem | 10px | 按钮内边距 |
| **3** | 0.75rem | 12px | 标准间距 |
| **3.5** | 0.875rem | 14px | 中等间距 |
| **4** | 1rem | 16px | 基础字体大小 |
| **5** | 1.25rem | 20px | 大间距 |
| **6** | 1.5rem | 24px | 组件间距 |
| **7** | 1.75rem | 28px | 章节间距 |
| **8** | 2rem | 32px | 主要间距 |
| **9** | 2.25rem | 36px | 大组件间距 |
| **10** | 2.5rem | 40px | 页面间距 |
| **11** | 2.75rem | 44px | 大页面间距 |
| **12** | 3rem | 48px | 最大间距 |

#### 3.2 间距使用指南
- **内边距 (Padding)**: 使用 2、3、4、6、8 单位
- **外边距 (Margin)**: 使用 4、6、8、10、12 单位
- **间隙 (Gap)**: 使用 2、3、4、6 单位
- **容器间距**: 使用 6、8、10、12 单位

### 4. 圆角系统

| 名称 | 值 | 像素 | 使用场景 |
|------|-----|------|----------|
| **none** | 0 | 0px | 直角、科技感元素 |
| **sm** | 0.125rem | 2px | 小圆角、输入框 |
| **base** | 0.25rem | 4px | 标准圆角、按钮 |
| **md** | 0.375rem | 6px | 中等圆角、卡片 |
| **lg** | 0.5rem | 8px | 大圆角、模态框 |
| **xl** | 0.75rem | 12px | 特大圆角、特色元素 |
| **2xl** | 1rem | 16px | 超大圆角、头像 |
| **3xl** | 1.5rem | 24px | 最大圆角、圆形容器 |
| **full** | 9999px | - | 圆形、药丸形状 |

### 5. 阴影系统

#### 5.1 层级阴影

**基础阴影**
```css
shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)
shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)
shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25)
```

#### 5.2 特殊阴影

**发光效果**
```css
shadow-glow: 0 0 20px rgba(0, 245, 212, 0.5)
shadow-glow-primary: 0 0 25px rgba(14, 165, 233, 0.4)
```

**使用场景**: 活动状态、高亮元素、交互反馈

**卡片悬停**
```css
shadow-card-hover: 0 10px 40px rgba(0, 0, 0, 0.15)
```

**使用场景**: 可交互卡片的悬停状态

**深度阴影**
```css
shadow-depth: 0 25px 50px -12px rgba(0, 0, 0, 0.25)
```

**使用场景**: 模态框、对话框、浮层

**内发光**
```css
shadow-inner-glow: inset 0 2px 4px 0 rgba(0, 245, 212, 0.2)
```

**使用场景**: 输入框焦点状态、活动标签

### 6. 动画系统

#### 6.1 关键帧动画

**微光效果 (Shimmer)**
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```
**使用场景**: 加载状态、骨架屏
**类名**: `animate-shimmer`
**时长**: 2s
**缓动**: linear
**重复**: infinite

**浮动效果 (Float)**
```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
```
**使用场景**: 悬浮元素、装饰性动画
**类名**: `animate-float`
**时长**: 6s
**缓动**: ease-in-out
**重复**: infinite

**渐变动画 (Gradient)**
```css
@keyframes gradient {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
```
**使用场景**: 背景效果、数据可视化
**类名**: `animate-gradient`
**时长**: 8s
**缓动**: ease
**重复**: infinite

**淡入效果 (FadeIn)**
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```
**使用场景**: 页面过渡、元素显示
**类名**: `animate-fade-in`
**时长**: 0.3s
**缓动**: ease-in-out

**上滑效果 (SlideUp)**
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```
**使用场景**: 模态框、通知、下拉内容
**类名**: `animate-slide-up`
**时长**: 0.3s
**缓动**: ease-out

**脉动发光 (PulseGlow)**
```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(14, 165, 233, 0); }
}
```
**使用场景**: 警告通知、重要提示
**类名**: `animate-pulse-glow` (需自定义)
**时长**: 2s
**缓动**: ease-in-out
**重复**: infinite

**慢速旋转 (SpinSlow)**
```css
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```
**使用场景**: 加载指示器、进度指示
**类名**: `animate-spin-slow`
**时长**: 3s
**缓动**: linear
**重复**: infinite

**轻微弹跳 (BounceSubtle)**
```css
@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
```
**使用场景**: 交互反馈、按钮悬停
**类名**: `animate-bounce-subtle` (需自定义)
**时长**: 0.5s
**缓动**: ease-in-out

#### 6.2 缓动函数

**标准缓动**
```css
ease-in-out-cubic: cubic-bezier(0.65, 0, 0.35, 1)
ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)
ease-in-out-back: cubic-bezier(0.68, -0.6, 0.32, 1.6)
```

**使用指南**:
- **页面过渡**: `ease-in-out-cubic`
- **元素出现**: `ease-out-expo`
- **交互反馈**: `ease-in-out-back`

#### 6.3 动画原则
1. **性能优先**: 使用 `transform` 和 `opacity` 进行硬件加速
2. **时长控制**: 交互动画 100-300ms，过渡动画 300-500ms
3. **减少运动**: 支持 `prefers-reduced-motion` 媒体查询
4. **一致性**: 相同类型的动画使用相同的时长和缓动

### 7. 可访问性规范

#### 7.1 焦点管理
- 所有交互元素必须有可见焦点状态
- 焦点顺序必须符合逻辑流
- 使用 `:focus-visible` 而非 `:focus` 避免鼠标交互的焦点环

**焦点样式**:
```css
:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
  border-radius: 0.25rem;
}
```

#### 7.2 ARIA 属性
- **按钮**: `role="button"`, `aria-label` 或 `aria-labelledby`
- **链接**: `role="link"`, 明确的 `href` 属性
- **表单**: 每个输入必须有 `label` 或 `aria-label`
- **状态**: 使用 `aria-live`, `aria-busy`, `aria-disabled` 等

#### 7.3 键盘导航
- **Tab 顺序**: 符合视觉流和逻辑流
- **快捷键**: 提供常见操作的键盘快捷键
- **跳过链接**: 提供跳转到主要内容的链接
- **焦点陷阱**: 模态框必须包含焦点陷阱

#### 7.4 颜色对比度
- 所有文本必须满足 WCAG AA 标准 (≥ 4.5:1)
- 大文本可以满足 WCAG AA 大文本标准 (≥ 3:1)
- 交互元素必须有足够的颜色对比度 (≥ 3:1)

#### 7.5 减少运动支持
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 🧩 组件规范

### 1. 按钮组件

#### 变体 (Variants)
- **Primary**: 主要操作按钮
- **Secondary**: 次要操作按钮
- **Ghost**: 无背景的文本按钮
- **Outline**: 边框按钮
- **Danger**: 危险操作按钮
- **Success**: 成功操作按钮

#### 大小 (Sizes)
- **xs**: 紧凑按钮，用于表格操作
- **sm**: 小按钮，用于表单
- **md**: 标准按钮，默认大小
- **lg**: 大按钮，用于重要操作
- **xl**: 超大按钮，用于页面级操作

#### 状态 (States)
- **Default**: 默认状态
- **Hover**: 悬停状态
- **Focus**: 焦点状态
- **Active**: 激活状态
- **Disabled**: 禁用状态
- **Loading**: 加载状态

### 2. 表单组件

#### 输入框 (Input)
- **变体**: Outline、Filled、Underlined
- **大小**: sm、md、lg
- **状态**: Default、Error、Success、Warning、Disabled

#### 选择框 (Select)
- **变体**: Outline、Filled
- **大小**: sm、md、lg
- **特性**: 搜索功能、多选、分组选项

#### 复选框 (Checkbox)
- **大小**: sm、md、lg
- **状态**: Checked、Indeterminate、Disabled

#### 单选框 (Radio)
- **大小**: sm、md、lg
- **状态**: Checked、Disabled

#### 开关 (Switch)
- **大小**: sm、md、lg
- **状态**: Checked、Disabled

### 3. 数据展示组件

#### 卡片 (Card)
- **变体**: Default、Elevated、Outlined、Interactive
- **大小**: sm、md、lg
- **特性**: 头部、内容、底部、可折叠

#### 表格 (Table)
- **变体**: Default、Striped、Bordered、Compact
- **状态**: Hover、Selected、Disabled
- **特性**: 排序、筛选、分页、虚拟滚动

#### 列表 (List)
- **变体**: Default、Bordered、Striped
- **大小**: sm、md、lg
- **特性**: 可选择、可拖拽、虚拟滚动

### 4. 反馈组件

#### 加载状态 (Loading)
- **类型**: Spinner、Skeleton、Progress
- **大小**: sm、md、lg
- **位置**: Inline、Block、Fullscreen

#### 通知 (Notification)
- **类型**: Success、Error、Warning、Info
- **位置**: Top、Bottom、Top-right、Bottom-right
- **特性**: 自动关闭、手动关闭、可操作

#### 模态框 (Modal)
- **大小**: sm、md、lg、xl、full
- **特性**: 可关闭、可拖拽、响应式、焦点管理

#### 提示框 (Tooltip)
- **位置**: Top、Right、Bottom、Left、Top-start、Top-end 等
- **特性**: 延迟显示、箭头、可交互

### 5. 导航组件

#### 侧边栏 (Sidebar)
- **变体**: Collapsed、Expanded、Floating
- **特性**: 响应式、可折叠、多级菜单、活动状态

#### 面包屑 (Breadcrumb)
- **变体**: Default、Transparent、With-icons
- **特性**: 可点击、分隔符自定义、响应式

#### 分页 (Pagination)
- **变体**: Default、Compact、Simple
- **特性**: 页面跳转、页面大小选择、项目总数显示

### 6. 布局组件

#### 容器 (Container)
- **大小**: sm、md、lg、xl、fluid
- **特性**: 响应式断点、居中、最大宽度

#### 栅格 (Grid)
- **列数**: 12列系统
- **间隙**: 支持所有间距单位
- **响应式**: 基于断点的列布局

#### 分割线 (Divider)
- **方向**: Horizontal、Vertical
- **变体**: Solid、Dashed、Dotted
- **特性**: 带文本、带图标

---

## 📱 响应式设计

### 断点系统

| 断点 | 最小宽度 | 类别 | 使用场景 |
|------|----------|------|----------|
| **xs** | 0px | 移动端 | 手机竖屏 |
| **sm** | 640px | 移动端 | 手机横屏、小平板 |
| **md** | 768px | 平板端 | 平板竖屏 |
| **lg** | 1024px | 桌面端 | 平板横屏、小桌面 |
| **xl** | 1280px | 桌面端 | 标准桌面 |
| **2xl** | 1536px | 大桌面端 | 大显示器 |

### 响应式策略

#### 1. 移动端优先
- 从小屏幕开始设计，逐步增强
- 使用 `min-width` 媒体查询
- 避免使用 `max-width` 媒体查询

#### 2. 渐进增强
- 核心功能在所有设备上可用
- 增强功能在大屏幕上添加
- 使用特性检测而非设备检测

#### 3. 触摸优化
- 触摸目标最小 44×44px
- 避免悬停依赖的交互
- 支持手势操作（滑动、长按）

### 响应式组件模式

#### 侧边栏
- **移动端**: 抽屉式导航，从左侧滑出
- **平板端**: 可折叠侧边栏，图标模式
- **桌面端**: 固定侧边栏，完整宽度

#### 表格
- **移动端**: 卡片列表，每行一个卡片
- **平板端**: 可水平滚动的表格
- **桌面端**: 完整表格，所有列可见

#### 表单
- **移动端**: 单列布局，垂直排列
- **平板端**: 两列布局，适当分组
- **桌面端**: 多列布局，充分利用空间

---

## 🎯 使用指南

### 设计 Token 使用

#### 在 Tailwind 中使用
```html
<!-- 颜色 -->
<div class="bg-primary-500 text-white">主色调</div>
<div class="text-success-500">成功文本</div>

<!-- 字体 -->
<h1 class="font-display text-3xl">显示字体标题</h1>
<p class="font-body text-lg">正文字体段落</p>

<!-- 间距 -->
<div class="p-4 m-6">标准间距</div>
<div class="space-y-4">垂直间隙</div>

<!-- 圆角 -->
<button class="rounded-lg">标准圆角按钮</button>
<div class="rounded-full">圆形元素</div>

<!-- 阴影 -->
<div class="shadow-lg">标准阴影</div>
<div class="shadow-glow-primary">发光效果</div>

<!-- 动画 -->
<div class="animate-shimmer">微光效果</div>
<div class="animate-fade-in">淡入效果</div>
```

#### 在 CSS-in-JS 中使用
```typescript
import { css } from '@emotion/react';

const buttonStyle = css`
  background-color: theme('colors.primary.500');
  color: theme('colors.white');
  font-family: theme('fontFamily.display');
  padding: theme('spacing.3') theme('spacing.6');
  border-radius: theme('borderRadius.lg');
  box-shadow: theme('boxShadow.md');
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: theme('colors.primary.600');
    box-shadow: theme('boxShadow.lg');
  }
`;
```

### 组件开发指南

#### 创建新组件
1. **分析需求**: 确定组件的用途、变体、状态
2. **设计 API**: 定义 Props 接口、事件处理、插槽
3. **实现基础**: 创建基础组件结构和样式
4. **添加状态**: 实现所有状态和交互
5. **测试验证**: 添加单元测试和交互测试
6. **文档编写**: 创建使用示例和 API 文档

#### 组件 Props 设计原则
- **一致性**: 相同概念使用相同的 Prop 名称
- **简洁性**: 避免过多的 Props，使用组合替代配置
- **可预测性**: Props 的行为应该符合用户预期
- **可访问性**: 默认包含必要的可访问性属性

#### 样式组织原则
- **CSS 模块化**: 使用 CSS Modules 或 styled-components
- **设计 Token**: 所有样式值必须来自设计 Token
- **响应式**: 使用 Tailwind 的响应式前缀
- **状态管理**: 使用 Tailwind 的状态变体（hover、focus 等）

### 性能优化指南

#### 动画性能
1. **硬件加速**: 使用 `transform` 和 `opacity`
2. **will-change**: 提前声明动画属性
3. **避免布局抖动**: 避免动画引起布局重排
4. **简化关键帧**: 减少关键帧数量和复杂度

#### 渲染性能
1. **虚拟列表**: 大数据列表使用虚拟滚动
2. **代码分割**: 路由级别的代码分割
3. **图片优化**: 使用 Next.js Image 组件
4. **字体优化**: 字体子集化和预加载

#### 加载性能
1. **骨架屏**: 数据加载时显示骨架屏
2. **渐进式加载**: 关键内容优先加载
3. **预加载**: 预测用户行为预加载资源
4. **缓存策略**: 合理的 HTTP 缓存头

### 可访问性检查清单

#### 开发时检查
- [ ] 所有交互元素有键盘支持
- [ ] 所有图片有 alt 文本
- [ ] 所有表单有关联的 label
- [ ] 颜色对比度满足 WCAG 标准
- [ ] 焦点顺序符合逻辑流
- [ ] 支持屏幕阅读器导航
- [ ] 支持减少运动偏好

#### 测试时检查
- [ ] 键盘导航完整测试
- [ ] 屏幕阅读器测试
- [ ] 颜色对比度工具检查
- [ ] 可访问性审计工具（axe、Lighthouse）

---

## 🔧 工具和资源

### 开发工具
- **VS Code 插件**: Tailwind CSS IntelliSense、ESLint、Prettier
- **浏览器扩展**: axe DevTools、Lighthouse
- **设计工具**: Figma、Adobe XD、Sketch

### 测试工具
- **单元测试**: Jest、React Testing Library
- **E2E 测试**: Cypress、Playwright
- **性能测试**: Lighthouse、WebPageTest
- **可访问性测试**: axe-core、pa11y

### 设计资源
- **颜色工具**: Coolors、Adobe Color
- **字体工具**: Google Fonts、Font Share
- **图标库**: Lucide、Heroicons、Radix Icons
- **插画库**: unDraw、Open Peeps

### 文档工具
- **组件文档**: Storybook、Docz
- **设计文档**: Notion、Confluence
- **API 文档**: Swagger、TypeDoc

---

## 📈 版本管理

### 版本号规则
使用语义化版本控制 (SemVer):
- **主版本号**: 破坏性更改
- **次版本号**: 向后兼容的功能添加
- **修订号**: 向后兼容的问题修复

### 更新日志格式
```markdown
## [版本号] - YYYY-MM-DD

### 新增
- 新功能描述

### 改进
- 现有功能改进

### 修复
- 问题修复

### 破坏性更改
- 需要用户注意的更改
```

### 向后兼容性
1. **API 兼容性**: 公共 API 保持向后兼容
2. **样式兼容性**: CSS 类名不随意更改
3. **行为兼容性**: 组件行为不随意更改
4. **迁移指南**: 破坏性更改提供迁移指南

---

## 📞 支持和贡献

### 报告问题
1. **搜索现有问题**: 避免重复报告
2. **提供详细信息**: 环境、版本、重现步骤
3. **添加截图或录屏**: 可视化问题
4. **建议解决方案**: 如果可能的话

### 贡献指南
1. **讨论提案**: 在 Issue 中讨论新功能
2. **创建分支**: 从主分支创建功能分支
3. **遵循规范**: 代码风格、提交信息、测试
4. **更新文档**: 相关文档必须更新
5. **创建 PR**: 描述更改和测试结果

### 维护团队
- **设计系统维护**: 架构团队
- **组件维护**: 前端团队
- **文档维护**: 技术写作团队

---

**文档版本**: 1.0
**最后审核**: 2025-12-02
**下次审核计划**: 2025-12-16
**维护状态**: 活跃维护