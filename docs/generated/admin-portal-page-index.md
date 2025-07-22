# Admin Portal Page Index

本文档为 `admin-portal` 应用的所有页面提供索引和功能描述。

**最后更新时间：2025-07-22**

## 认证 (Auth)

这些页面属于 `(auth)` 路由组，负责处理用户的登录和认证回调。

| 路由 (Route)     | 文件路径                        | 功能描述                                                                                                                              |
| :--------------- | :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`         | `(auth)/login/page.tsx`         | **登录页面**: 显示登录表单，引导用户通过 OAuth 2.0 进行认证。处理认证过程中的错误显示。                                               |
| `/callback`      | `(auth)/callback/page.tsx`      | **认证回调页面**: 处理从 OAuth 服务器重定向回来的请求，交换授权码 (code) 为访问令牌。成功后将用户重定向到仪表盘，失败则显示错误信息。 |

## 仪表盘与核心功能 (Dashboard & Core Features)

这些页面属于 `(dashboard)` 路由组，是用户登录后看到的主要功能界面。

| 路由 (Route)        | 文件路径                                | 功能描述                                                                                                             |
| :------------------ | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `/`                 | `(dashboard)/page.tsx`                  | **主页/仪表盘**: 用户登录后的默认页面，显示核心统计数据和导航入口。                                                  |
| `/admin`            | `(dashboard)/admin/page.tsx`            | **管理员仪表盘**: 显示核心统计数据，如用户总数、客户端总数、角色总数和令牌颁发情况，并包含用户增长趋势图表。         |
| `/profile`          | `(dashboard)/profile/page.tsx`          | **用户个人资料页**: 允许当前登录用户查看和更新自己的基本信息（显示名称、邮箱），修改密码，并查看自己拥有的权限列表。 |
| `/clients/register` | `(dashboard)/clients/register/page.tsx` | **客户端注册页**: 提供一个表单，允许授权用户注册新的 OAuth 客户端应用，并获取 `client_id` 和 `client_secret`。       |
| `/oauth/consent`    | `(dashboard)/oauth/consent/page.tsx`    | **OAuth 同意页**: 当用户授权一个应用时，此页面会显示该应用请求的权限，并让用户决定是"允许"还是"拒绝"授权。           |
| `/oauth/error`      | `(dashboard)/oauth/error/page.tsx`      | **OAuth 错误页**: 显示 OAuth 授权过程中出现的错误信息，如权限不足、客户端配置错误等。                                |
| `/health`           | `(dashboard)/health/page.tsx`           | **健康检查页**: 一个简单的页面，用于验证 `admin-portal` 前端服务是否正常运行。                                       |
| `/unauthorized`     | `(dashboard)/unauthorized/page.tsx`     | **未授权页面**: 当用户尝试访问一个他们没有权限的页面时，会显示此页面，提示权限不足。                                 |

## 系统管理 (System Management)

这些页面位于 `/admin/system` 路径下，用于管理 OAuth 服务的核心实体和配置。所有页面都使用了 `PermissionGuard` 进行权限保护。

| 路由 (Route)                               | 文件路径                                                                         | 功能描述                                                                                                      |
| :----------------------------------------- | :------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| `/admin/users`                             | `(dashboard)/admin/users/page.tsx`                                               | **用户管理**: (由 `UserManagementView` 组件驱动) 提供一个界面来列出、创建、编辑和删除系统中的所有用户。       |
| `/admin/system/clients`                    | `(dashboard)/admin/system/clients/page.tsx`                                      | **客户端管理**: (由 `ClientManagementView` 组件驱动) 提供一个界面来管理所有已注册的 OAuth 客户端应用。        |
| `/admin/system/roles`                      | `(dashboard)/admin/system/roles/page.tsx`                                        | **角色管理**: (由 `RoleManagementView` 组件驱动) 提供一个界面来管理角色，包括创建角色、分配权限等。           |
| `/admin/system/permissions`                | `(dashboard)/admin/system/permissions/page.tsx`                                  | **权限查看**: 提供一个数据表格，用于查看和搜索系统中所有已定义的细粒度权限。                                  |
| `/admin/system/audits` (或 `/admin/audit`) | `(dashboard)/admin/system/audits/page.tsx` or `(dashboard)/admin/audit/page.tsx` | **审计日志**: (由 `AuditLogView` 组件驱动) 显示系统的审计日志，允许管理员查看关键操作的记录，支持过滤和搜索。 |
| `/admin/system/config`                     | `(dashboard)/admin/system/config/page.tsx`                                       | **系统配置**: 提供一个表单，用于管理 OAuth 服务的核心配置，如令牌生命周期、是否允许密码授权模式等。           |