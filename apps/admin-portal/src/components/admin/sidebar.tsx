// components/admin/sidebar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart,
  Briefcase,
  FileText,
  Home,
  Key,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth'; // Placeholder auth hook
import { cn } from '@/lib/utils'; // For conditional class names
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * @typedef NavItem
 * @property {string} href - 导航链接的路径 (Path for the navigation link).
 * @property {string} label - 导航链接的显示文本 (Display text for the navigation link).
 * @property {React.ElementType} icon - 导航链接的图标组件 (Icon component for the navigation link).
 * @property {string[]} requiredPermissions - 查看此菜单项所需的权限列表 (List of permissions required to view this menu item).
 * @property {NavItem[]} [children] - 子菜单项列表 (Optional list of child menu items for submenus).
 */
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  requiredPermissions: string[];
  children?: NavItem[];
}

// 基于文档定义的菜单结构 (Menu structure based on documentation)
// 权限名称需要与后端权限定义一致 (Permission names must match backend definitions)
const allNavItems: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: Home, requiredPermissions: ['menu:dashboard:view'] },
  {
    href: '#',
    label: 'System',
    icon: Settings,
    requiredPermissions: ['menu:system:view'],
    children: [
      { href: '/admin/users', label: 'Users', icon: Users, requiredPermissions: ['menu:system:user:view', 'users:list'] },
      { href: '/admin/system/roles', label: 'Roles', icon: Shield, requiredPermissions: ['menu:system:role:view', 'roles:list'] },
      { href: '/admin/system/permissions', label: 'Permissions', icon: Key, requiredPermissions: ['menu:system:permission:view', 'permissions:list'] },
      { href: '/admin/system/clients', label: 'Clients', icon: Briefcase, requiredPermissions: ['menu:system:client:view', 'clients:list'] },
      { href: '/admin/system/scopes', label: 'Scopes', icon: BarChart, requiredPermissions: ['menu:system:scope:view', 'scopes:list'] },
      { href: '/admin/audit', label: 'Audit Logs', icon: FileText, requiredPermissions: ['menu:system:audit:view', 'audit:list'] },
    ]
  },
];

/**
 * 后台管理界面的侧边导航栏 (Sidebar navigation for the admin dashboard)
 *
 * 根据用户权限动态呈现菜单项。
 * Dynamically renders menu items based on user permissions.
 */
export default function AdminSidebar() {
  const { user, isLoading: authLoading } = useAuth(); // Using the placeholder auth hook
  const pathname = usePathname();
  const [openSubmenus, setOpenSubmenus] = React.useState<Record<string, boolean>>({});

  const toggleSubmenu = (label: string) => {
    setOpenSubmenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // 根据用户权限过滤菜单项 (Filter menu items based on user permissions)
  const filterNavItemsByPermissions = (items: NavItem[], userPermissions: string[] | undefined): NavItem[] => {
    if (!userPermissions) return [];
    return items.filter(item =>
      item.requiredPermissions.every(perm => userPermissions.includes(perm))
    ).map(item => ({
      ...item,
      children: item.children ? filterNavItemsByPermissions(item.children, userPermissions) : undefined,
    })).filter(item => item.children ? item.children.length > 0 : true); // Remove parent if no children visible
  };

  if (authLoading) {
    return (
      <aside className="w-64 bg-white dark:bg-slate-800 p-4 space-y-2 shadow-lg">
        <p className="text-sm text-gray-500 dark:text-gray-400">加载用户权限... (Loading user permissions...)</p>
        {/* Skeleton loaders for menu items */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
        ))}
      </aside>
    );
  }

  const availableNavItems = user ? filterNavItemsByPermissions(allNavItems, user.permissions) : [];

  return (
    <aside className="w-64 bg-white dark:bg-slate-800 shadow-lg hidden md:block">
      <ScrollArea className="h-full py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            管理中心 (Admin Center)
          </h2>
          <div className="space-y-1">
            {availableNavItems.map((item) =>
              item.children ? (
                <div key={item.label}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => toggleSubmenu(item.label)}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                  {openSubmenus[item.label] && (
                    <div className="ml-4 pl-4 border-l border-slate-200 dark:border-slate-700 space-y-1 py-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            buttonVariants({ variant: 'ghost' }),
                            'w-full justify-start text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700',
                            pathname === child.href && 'bg-slate-100 dark:bg-slate-700 font-semibold'
                          )}
                        >
                          <child.icon className="mr-2 h-4 w-4" />
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: 'ghost' }),
                    'w-full justify-start text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
                    pathname === item.href && 'bg-slate-100 dark:bg-slate-700 font-semibold'
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              )
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
