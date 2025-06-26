import { NextResponse } from 'next/server';
import type { MenuItem } from '@repo/ui/types'; // Import from shared types

// Mock menu data
// Note: The MenuItem type from @repo/ui/types uses `keyof typeof LucideIcons` for icon.
// This API route should ensure icon names are valid LucideIcon names.
const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    title: '仪表盘', // Dashboard
    href: '/admin',
    icon: 'Home', // Example Lucide icon name
  },
  {
    id: 'users',
    title: '用户管理', // User Management
    href: '/admin/users',
    icon: 'Users',
    children: [
      {
        id: 'users-list',
        title: '用户列表', // User List
        href: '/admin/users',
        icon: 'List',
      },
      {
        id: 'users-roles',
        title: '角色权限', // Roles & Permissions
        href: '/admin/users/roles',
        icon: 'ShieldCheck',
      },
    ],
  },
  {
    id: 'system',
    title: '系统设置', // System Settings
    href: '/admin/system',
    icon: 'Settings',
    children: [
      {
        id: 'system-general',
        title: '常规设置', // General Settings
        href: '/admin/system/general',
        icon: 'SlidersHorizontal',
      },
      {
        id: 'system-audit',
        title: '审计日志', // Audit Log
        href: '/admin/audit', // Corrected from /admin/system/audit to match existing file structure
        icon: 'ScrollText',
      },
    ],
  },
  {
    id: 'clients',
    title: 'OAuth客户端', // OAuth Clients
    href: '/admin/clients',
    icon: 'AppWindow',
  },
  {
    id: 'profile',
    title: '个人资料', // Profile
    href: '/profile', // Assuming /profile is a valid top-level dashboard page
    icon: 'UserCircle',
  },
];

export async function GET() {
  // In a real application, you would fetch this data based on user roles/permissions.
  // For now, we return mock data.
  // Simulate a delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  return NextResponse.json(menuItems);
}
