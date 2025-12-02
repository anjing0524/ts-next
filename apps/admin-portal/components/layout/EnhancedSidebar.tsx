'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from "@repo/ui";
import { Button } from "@repo/ui";
import { ScrollArea } from "@repo/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui";
import {
  Home,
  Users,
  ShieldCheck,
  KeyRound,
  AppWindow,
  ScrollText,
  Settings2,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
  Menu,
} from 'lucide-react';
import { useAuth } from '@repo/ui/hooks';
import { MenuItem } from './MenuItem';

interface MenuItemType {
  id: string;
  name: string;
  path: string;
  icon: any; // LucideIcon类型
  permissions?: string[];
}

const menuItems: MenuItemType[] = [
  {
    id: 'dashboard',
    name: '仪表盘',
    path: '/admin',
    icon: Home,
    permissions: ['menu:dashboard:view'],
  },
  {
    id: 'users',
    name: '用户管理',
    path: '/admin/users',
    icon: Users,
    permissions: ['menu:system:user:view', 'users:list'],
  },
  {
    id: 'roles',
    name: '角色管理',
    path: '/admin/system/roles',
    icon: ShieldCheck,
    permissions: ['menu:system:role:view', 'roles:list'],
  },
  {
    id: 'permissions',
    name: '权限管理',
    path: '/admin/system/permissions',
    icon: KeyRound,
    permissions: ['menu:system:permission:view', 'permissions:list'],
  },
  {
    id: 'clients',
    name: 'OAuth 客户端',
    path: '/admin/system/clients',
    icon: AppWindow,
    permissions: ['menu:system:client:view', 'clients:list'],
  },
  {
    id: 'audits',
    name: '审计日志',
    path: '/admin/system/audits',
    icon: ScrollText,
    permissions: ['menu:system:audit:view', 'audit:list'],
  },
  {
    id: 'config',
    name: '系统配置',
    path: '/admin/config',
    icon: Settings2,
    permissions: ['menu:system:config:view'],
  },
];

interface EnhancedSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function EnhancedSidebar({ isCollapsed, onToggleCollapse }: EnhancedSidebarProps) {
  const pathname = usePathname();
  const { user, logout, hasPermission } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  // 过滤有权限的菜单项
  const filteredMenuItems = menuItems.filter(item =>
    item.permissions ? hasPermission(item.permissions) : true
  );

  // 获取用户首字母用于头像
  const getUserInitial = () => {
    return user?.username?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <div
      className={cn(
        'relative flex h-full flex-col border-r transition-all duration-500 ease-in-out',
        'bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95',
        'backdrop-blur-sm shadow-2xl shadow-primary/10',
        isCollapsed ? 'w-20' : 'w-64'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
      }}
    >
      {/* Logo区域 */}
      <div className="flex h-16 items-center justify-between border-b border-slate-700/50 px-4">
        <Link
          href="/admin"
          className={cn(
            'flex items-center space-x-2 overflow-hidden transition-all duration-300',
            isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          )}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-lg" />
          <span className="font-bold text-lg bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
            Admin Portal
          </span>
        </Link>

        {/* 折叠按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={cn(
            'h-8 w-8 rounded-lg transition-all duration-300',
            'hover:bg-primary/20 hover:text-primary',
            'focus-visible:ring-2 focus-visible:ring-primary/50'
          )}
          aria-label={isCollapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* 导航菜单 */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {filteredMenuItems.map((item) => {
            const isActive = pathname === item.path ||
              (item.path !== '/admin' && pathname?.startsWith(item.path));

            return (
              <MenuItem
                key={item.id}
                href={item.path}
                icon={item.icon}
                label={item.name}
                isActive={isActive}
                isCollapsed={isCollapsed}
              />
            );
          })}
        </nav>
      </ScrollArea>

      {/* 用户信息区域 */}
      <div className={cn(
        'border-t border-slate-700/50 p-4 transition-all duration-300',
        isCollapsed ? 'px-3' : 'px-4'
      )}>
        <div className={cn(
          'flex items-center space-x-3 overflow-hidden transition-all duration-300',
          isCollapsed ? 'justify-center' : 'justify-start'
        )}>
          {/* 用户头像 */}
          <Avatar className="h-8 w-8 ring-2 ring-primary/30 ring-offset-2 ring-offset-slate-900">
            <AvatarImage src={user?.avatar} alt={user?.username || '用户'} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-cyan-500 text-white">
              {getUserInitial()}
            </AvatarFallback>
          </Avatar>

          {/* 用户信息 - 折叠时隐藏 */}
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.username || '用户'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email || '管理员'}
              </p>
            </div>
          )}

          {/* 退出按钮 - 折叠时显示图标，展开时显示文字 */}
          {!isCollapsed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="h-8 px-3 text-sm text-muted-foreground hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* 个人资料链接 - 折叠时隐藏 */}
        {!isCollapsed && (
          <div className="mt-3">
            <Link
              href="/profile"
              className="flex items-center space-x-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-slate-800/50 hover:text-foreground"
            >
              <User className="h-4 w-4" />
              <span>个人资料</span>
            </Link>
          </div>
        )}
      </div>

      {/* 装饰性元素 */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>
    </div>
  );
}