import { NextResponse } from 'next/server';

// Helper function to filter menu items based on user permissions
function filterMenuItems(menuItems: any[], userPermissions: string[]): any[] {
  return menuItems
    .filter((item) => {
      // If item has no specific permissions, it's visible by default
      if (!item.permissions || item.permissions.length === 0) {
        return true;
      }
      // Check if user has any of the required permissions for this item
      return item.permissions.some((perm: string) => userPermissions.includes(perm));
    })
    .map((item) => {
      // Recursively filter children
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: filterMenuItems(item.children, userPermissions),
        };
      }
      return item;
    })
    .filter((item) => {
      // Remove parent items if all their children were filtered out
      return !item.children || item.children.length > 0 || item.path !== '#';
    })
    .sort((a, b) => a.order - b.order); // Sort by order
}

export async function GET() {
  try {
    // 简化版本：直接返回静态菜单，不进行JWT验证
    const staticMenus = [
      {
        id: 'dashboard',
        name: '仪表盘',
        key: 'dashboard',
        path: '/admin',
        icon: 'LayoutDashboard',
        order: 10,
        permissions: ['menu:dashboard:view'],
      },
      {
        id: 'system-management',
        name: '系统管理',
        key: 'system-management',
        path: '#',
        icon: 'Settings',
        order: 100,
        children: [
          {
            id: 'users',
            name: '用户管理',
            key: 'users',
            path: '/admin/users',
            icon: 'Users',
            order: 110,
            permissions: ['menu:system:user:view', 'users:list'],
          },
          {
            id: 'roles',
            name: '角色管理',
            key: 'roles',
            path: '/admin/system/roles',
            icon: 'ShieldCheck',
            order: 120,
            permissions: ['menu:system:role:view', 'roles:list'],
          },
          {
            id: 'permissions',
            name: '权限管理',
            key: 'permissions',
            path: '/admin/system/permissions',
            icon: 'KeyRound',
            order: 130,
            permissions: ['menu:system:permission:view', 'permissions:list'],
          },
          {
            id: 'clients',
            name: 'OAuth 客户端',
            key: 'clients',
            path: '/admin/system/clients',
            icon: 'AppWindow',
            order: 140,
            permissions: ['menu:system:client:view', 'clients:list'],
          },
          {
            id: 'audit-logs',
            name: '审计日志',
            key: 'audit-logs',
            path: '/admin/system/audits',
            icon: 'ScrollText',
            order: 150,
            permissions: ['menu:system:audit:view', 'audit:list'],
          },
          {
            id: 'system-config',
            name: '系统配置',
            key: 'system-config',
            path: '/admin/system/config',
            icon: 'Settings2',
            order: 160,
            permissions: ['menu:system:config:view'],
          },
        ],
      },
      {
        id: 'oauth-register',
        name: '注册 OAuth 客户端',
        key: 'oauth-register',
        path: '/clients/register',
        icon: 'AppWindow',
        order: 200,
        permissions: ['clients:create'],
      },
    ];

    return NextResponse.json(staticMenus, { status: 200 });
  } catch (error) {
    console.error('Error fetching menu items:', error);
    return NextResponse.json([], { status: 200 });
  }
}

