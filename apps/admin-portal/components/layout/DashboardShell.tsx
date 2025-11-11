'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from "@repo/ui";
import { Button } from "@repo/ui";
import { ScrollArea } from "@repo/ui";
import { Sheet, SheetContent, SheetTrigger } from "@repo/ui";
import {
  Menu,
  Home,
  Users,
  ShieldCheck,
  KeyRound,
  AppWindow,
  ScrollText,
  Settings2,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '@repo/ui/hooks';
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui";

interface MenuItem {
  id: string;
  name: string;
  path: string;
  icon: string;
  permissions?: string[];
}

interface DashboardShellProps {
  children: React.ReactNode;
}

const iconMap = {
  Home,
  Users,
  ShieldCheck,
  KeyRound,
  AppWindow,
  ScrollText,
  Settings2,
};

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    name: '仪表盘',
    path: '/admin',
    icon: 'Home',
    permissions: ['menu:dashboard:view'],
  },
  {
    id: 'users',
    name: '用户管理',
    path: '/admin/users',
    icon: 'Users',
    permissions: ['menu:system:user:view', 'users:list'],
  },
  {
    id: 'roles',
    name: '角色管理',
    path: '/admin/system/roles',
    icon: 'ShieldCheck',
    permissions: ['menu:system:role:view', 'roles:list'],
  },
  {
    id: 'permissions',
    name: '权限管理',
    path: '/admin/system/permissions',
    icon: 'KeyRound',
    permissions: ['menu:system:permission:view', 'permissions:list'],
  },
  {
    id: 'clients',
    name: 'OAuth 客户端',
    path: '/admin/system/clients',
    icon: 'AppWindow',
    permissions: ['menu:system:client:view', 'clients:list'],
  },
  {
    id: 'audits',
    name: '审计日志',
    path: '/admin/system/audits',
    icon: 'ScrollText',
    permissions: ['menu:system:audit:view', 'audit:list'],
  },
  {
    id: 'config',
    name: '系统配置',
    path: '/admin/config',
    icon: 'Settings2',
    permissions: ['menu:system:config:view'],
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const { hasPermission } = useAuth();

  const filteredMenuItems = menuItems.filter(item => item.permissions ? hasPermission(item.permissions) : true);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/admin" className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded bg-primary" />
          <span className="font-bold">Admin Portal</span>
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-2">
          {filteredMenuItems.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const isActive = pathname === item.path;

            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Menu */}
      <div className="border-t p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start space-x-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback>
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{user?.username || '用户'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>我的账户</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="mr-2 h-4 w-4" />
                个人资料
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden w-64 flex-col border-r bg-background lg:flex">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden fixed top-4 left-4 z-50"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center border-b bg-background px-6 lg:px-8">
          <div className="flex flex-1 items-center justify-between">
            <div className="lg:hidden" /> {/* Spacer for mobile menu button */}
            <div className="flex items-center space-x-4">
              {/* 可以在这里添加面包屑导航或其他头部内容 */}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}