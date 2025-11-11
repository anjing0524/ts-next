# UI 组件索引

本索引列出了项目中所有可用的 UI 组件，包括基础组件、复合组件和类型定义。

**最后更新时间：2025-07-22**

## 基础 UI 组件 (Basic UI Components)

这些组件来自 `packages/ui/src/components/ui` 目录，提供基础的用户界面元素。

| 组件名         | 文件路径            | 描述                                         |
| -------------- | ------------------- | -------------------------------------------- |
| `AlertDialog`  | `alert-dialog.tsx`  | 一个模态对话框，中断用户操作并要求响应。     |
| `Alert`        | `alert.tsx`         | 用于显示重要消息的突出提示框。               |
| `Avatar`       | `avatar.tsx`        | 用于显示用户头像或图标的组件。               |
| `Badge`        | `badge.tsx`         | 用于突出显示信息或状态的小标签。             |
| `Button`       | `button.tsx`        | 标准按钮组件，支持多种变体和大小。           |
| `Calendar`     | `calendar.tsx`      | 用于选择日期的日历组件。                     |
| `Card`         | `card.tsx`          | 内容容器，通常包含头部、内容和底部。         |
| `Carousel`     | `carousel.tsx`      | 轮播组件，用于循环展示内容。                 |
| `Checkbox`     | `checkbox.tsx`      | 复选框组件，允许用户从一组选项中选择多个。   |
| `Collapsible`  | `collapsible.tsx`   | 可折叠/展开的内容区域。                      |
| `Command`      | `command.tsx`       | 用于构建命令行界面的组件，支持搜索和快捷键。 |
| `ContextMenu`  | `context-menu.tsx`  | 右键菜单组件。                               |
| `Dialog`       | `dialog.tsx`        | 通用模态对话框组件。                         |
| `Drawer`       | `drawer.tsx`        | 从屏幕边缘滑出的抽屉式面板。                 |
| `DropdownMenu` | `dropdown-menu.tsx` | 下拉菜单组件。                               |
| `Input`        | `input.tsx`         | 标准文本输入框。                             |
| `Label`        | `label.tsx`         | 表单元素的标签。                             |
| `Pagination`   | `pagination.tsx`    | 分页导航组件。                               |
| `Popover`      | `popover.tsx`       | 浮动弹出框，通常由点击或悬停触发。           |
| `RadioGroup`   | `radio-group.tsx`   | 单选按钮组，允许用户从一组选项中选择一个。   |
| `ScrollArea`   | `scroll-area.tsx`   | 带有自定义滚动条的内容滚动区域。             |
| `Select`       | `select.tsx`        | 下拉选择器组件。                             |
| `Separator`    | `separator.tsx`     | 用于分隔内容的水平或垂直线条。               |
| `Skeleton`     | `skeleton.tsx`      | 内容加载时的占位符组件。                     |
| `Switch`       | `switch.tsx`        | 开关组件，用于切换两种状态。                 |
| `Table`        | `table.tsx`         | 用于展示结构化数据的表格组件。               |
| `Tabs`         | `tabs.tsx`          | 选项卡组件，用于在不同视图之间切换。         |
| `Textarea`     | `textarea.tsx`      | 多行文本输入框。                             |
| `Tooltip`      | `tooltip.tsx`       | 鼠标悬停时显示的提示信息。                   |
| `useToast`     | `use-toast.tsx`     | 用于触发和管理Toast通知的Hook。              |

## 复合组件 (Composite Components)

### 认证组件 (Auth Components)

来自 `apps/admin-portal/components/auth/` 目录的认证相关组件。

| 组件名               | 文件路径                              | 描述                               |
| -------------------- | ------------------------------------- | ---------------------------------- |
| `AuthLayout`         | `components/AuthLayout.tsx`          | 认证页面布局包装器。               |
| `LoginForm`          | `components/auth/LoginForm.tsx`      | 用户登录表单组件。                 |
| `OAuthConsentForm`   | `components/auth/OAuthConsentForm.tsx` | OAuth 授权同意表单。               |

### 管理后台组件 (Admin Components)

来自 `apps/admin-portal/components/admin/` 目录的管理后台专用组件。

#### 客户端管理组件
| 组件名               | 文件路径                                          | 描述                               |
| -------------------- | ------------------------------------------------- | ---------------------------------- |
| `ClientFormDialog`   | `components/admin/clients/ClientFormDialog.tsx`   | 客户端创建/编辑对话框。            |
| `ClientSecretDialog` | `components/admin/clients/ClientSecretDialog.tsx` | 客户端密钥重置对话框。             |

#### 角色管理组件
| 组件名                   | 文件路径                                          | 描述                               |
| ------------------------ | ------------------------------------------------- | ---------------------------------- |
| `RoleFormDialog`         | `components/admin/roles/RoleFormDialog.tsx`       | 角色创建/编辑对话框。              |
| `RolePermissionsDialog`  | `components/admin/roles/RolePermissionsDialog.tsx`| 角色权限分配对话框。               |

#### 用户管理组件
| 组件名               | 文件路径                                      | 描述                               |
| -------------------- | --------------------------------------------- | ---------------------------------- |
| `UserFormDialog`     | `components/admin/users/UserFormDialog.tsx`   | 用户创建/编辑对话框。              |

### 通用组件 (Common Components)

来自 `apps/admin-portal/components/common/` 目录的通用组件。

| 组件名               | 文件路径                                     | 描述                               |
| -------------------- | -------------------------------------------- | ---------------------------------- |
| `DeleteConfirmDialog`| `components/common/DeleteConfirmDialog.tsx`  | 删除确认对话框。                   |
| `ErrorDisplay`       | `components/common/ErrorDisplay.tsx`         | 错误信息显示组件。                 |
| `SkeletonLoader`     | `components/common/SkeletonLoader.tsx`       | 骨架屏加载占位符。                 |
| `Spinner`            | `components/common/Spinner.tsx`              | 加载旋转器组件。                   |

### 布局组件 (Layout Components)

来自 `apps/admin-portal/components/` 目录的布局组件。

| 组件名               | 文件路径                              | 描述                               |
| -------------------- | ------------------------------------- | ---------------------------------- |
| `AdminHeader`        | `components/admin/header.tsx`        | 管理后台顶部导航栏。               |
| `AdminSidebar`       | `components/admin/sidebar.tsx`       | 管理后台侧边栏导航。               |

## 功能视图组件 (Feature View Components)

### 管理视图组件

来自 `apps/admin-portal/features/` 目录的功能视图组件。

| 组件名                  | 文件路径                                                   | 描述                               |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `UserManagementView`    | `features/users/components/UserManagementView.tsx`        | 用户管理完整视图组件。             |
| `ClientManagementView`  | `features/clients/components/ClientManagementView.tsx`    | 客户端管理完整视图组件。           |
| `RoleManagementView`    | `features/roles/components/RoleManagementView.tsx`        | 角色管理完整视图组件。             |
| `AuditLogView`          | `features/audit/components/AuditLogView.tsx`              | 审计日志查看组件。                 |

## 数据表格组件 (Data Table Components)

### 列定义组件

| 组件名               | 文件路径                                      | 描述                               |
| -------------------- | --------------------------------------------- | ---------------------------------- |
| `UserTableColumns`   | `features/users/components/UserTableColumns.tsx`   | 用户表格列定义。                   |

## 类型定义 (Type Definitions)

### UI 相关类型

来自 `packages/ui/src/types/` 和 `apps/admin-portal/types/` 目录的类型定义。

| 类型名         | 文件路径            | 描述                       |
| -------------- | ------------------- | -------------------------- |
| `MenuItem`     | `ui/src/types/menu.ts` | 菜单项类型定义。           |
| `MenuConfig`   | `ui/src/types/menu.ts` | 菜单配置类型定义。         |
| `User`         | `admin-portal/types/auth.ts` | 用户类型定义。             |
| `AuthState`    | `admin-portal/types/auth.ts` | 认证状态类型定义。         |

## 使用说明

### 组件导入方式

```typescript
// 基础UI组件
import { Button, Input, Card } from '@repo/ui';

// 管理后台组件
import { UserManagementView } from '@/features/users/components/UserManagementView';
import { ClientFormDialog } from '@/components/admin/clients/ClientFormDialog';

// 通用组件
import { ErrorDisplay, Spinner } from '@/components/common';
```

### 组件分类说明

1. **基础组件**：提供原子级的 UI 元素，如按钮、输入框等
2. **复合组件**：由多个基础组件组合而成的功能组件
3. **布局组件**：负责页面整体布局结构
4. **功能组件**：特定业务功能相关的组件
5. **类型定义**：确保组件使用的类型安全

### 开发规范

- **命名规范**：组件名使用 PascalCase，文件名使用 kebab-case
- **类型定义**：每个组件都应该有对应的 TypeScript 类型定义
- **文档注释**：复杂组件需要添加 JSDoc 注释说明使用方式
- **样式隔离**：使用 CSS Modules 或 Tailwind CSS 确保样式隔离