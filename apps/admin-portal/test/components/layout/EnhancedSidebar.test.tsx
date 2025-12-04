import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnhancedSidebar } from '../../../components/layout/EnhancedSidebar';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/admin'),
}));

// Mock @repo/ui/hooks
jest.mock('@repo/ui/hooks', () => ({
  useAuth: jest.fn(() => ({
    user: {
      username: 'testuser',
      email: 'test@example.com',
      avatar: 'https://example.com/avatar.jpg',
    },
    logout: jest.fn(),
    hasPermission: jest.fn(() => true),
  })),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Home: () => <div data-testid="icon-home">Home</div>,
  Users: () => <div data-testid="icon-users">Users</div>,
  ShieldCheck: () => <div data-testid="icon-shield-check">ShieldCheck</div>,
  KeyRound: () => <div data-testid="icon-key-round">KeyRound</div>,
  AppWindow: () => <div data-testid="icon-app-window">AppWindow</div>,
  ScrollText: () => <div data-testid="icon-scroll-text">ScrollText</div>,
  Settings2: () => <div data-testid="icon-settings2">Settings2</div>,
  LogOut: () => <div data-testid="icon-log-out">LogOut</div>,
  User: () => <div data-testid="icon-user">User</div>,
  ChevronLeft: () => <div data-testid="icon-chevron-left">ChevronLeft</div>,
  ChevronRight: () => <div data-testid="icon-chevron-right">ChevronRight</div>,
  Menu: () => <div data-testid="icon-menu">Menu</div>,
}));

describe('EnhancedSidebar', () => {
  const mockToggleCollapse = jest.fn();

  beforeEach(() => {
    mockToggleCollapse.mockClear();
  });

  it('渲染展开状态的侧边栏', () => {
    render(
      <EnhancedSidebar
        isCollapsed={false}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    // 检查Logo是否显示
    expect(screen.getByText('Admin Portal')).toBeInTheDocument();

    // 检查菜单项是否显示
    expect(screen.getByText('仪表盘')).toBeInTheDocument();
    expect(screen.getByText('用户管理')).toBeInTheDocument();
    expect(screen.getByText('角色管理')).toBeInTheDocument();
    expect(screen.getByText('权限管理')).toBeInTheDocument();
    expect(screen.getByText('OAuth 客户端')).toBeInTheDocument();
    expect(screen.getByText('审计日志')).toBeInTheDocument();
    expect(screen.getByText('系统配置')).toBeInTheDocument();

    // 检查用户信息是否显示
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    // 检查折叠按钮显示左箭头
    expect(screen.getByTestId('icon-chevron-left')).toBeInTheDocument();
  });

  it('渲染折叠状态的侧边栏', () => {
    render(
      <EnhancedSidebar
        isCollapsed={true}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    // 检查Logo是否隐藏（通过CSS隐藏，但仍然在DOM中）
    const logoElement = screen.queryByText('Admin Portal');
    expect(logoElement).toBeInTheDocument();
    // Logo文字本身没有opacity-0和w-0类，这些类在父链接元素上
    const logoLink = logoElement?.closest('a');
    expect(logoLink).toHaveClass('opacity-0');
    expect(logoLink).toHaveClass('w-0');

    // 检查菜单项文字是否隐藏（只显示图标）
    // 注意：工具提示中包含文字，但工具提示默认是隐藏的（hidden类）
    const dashboardTooltip = screen.queryByText('仪表盘');
    expect(dashboardTooltip).toBeInTheDocument(); // 工具提示在DOM中
    expect(dashboardTooltip).toHaveClass('hidden'); // 但默认是隐藏的

    const userManagementTooltip = screen.queryByText('用户管理');
    expect(userManagementTooltip).toBeInTheDocument(); // 工具提示在DOM中
    expect(userManagementTooltip).toHaveClass('hidden'); // 但默认是隐藏的

    // 检查用户信息是否隐藏
    expect(screen.queryByText('testuser')).not.toBeInTheDocument();
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();

    // 检查折叠按钮显示右箭头
    expect(screen.getByTestId('icon-chevron-right')).toBeInTheDocument();
  });

  it('点击折叠按钮时调用onToggleCollapse', () => {
    render(
      <EnhancedSidebar
        isCollapsed={false}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    const collapseButton = screen.getByLabelText('折叠侧边栏');
    fireEvent.click(collapseButton);

    expect(mockToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('点击退出按钮时调用logout函数', () => {
    const { useAuth } = require('@repo/ui/hooks');
    const mockLogout = jest.fn();
    useAuth.mockReturnValue({
      user: {
        username: 'testuser',
        email: 'test@example.com',
        avatar: 'https://example.com/avatar.jpg',
      },
      logout: mockLogout,
      hasPermission: jest.fn(() => true),
    });

    render(
      <EnhancedSidebar
        isCollapsed={false}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    const logoutButton = screen.getByText('退出');
    fireEvent.click(logoutButton);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('根据权限过滤菜单项', () => {
    const { useAuth } = require('@repo/ui/hooks');
    useAuth.mockReturnValue({
      user: {
        username: 'testuser',
        email: 'test@example.com',
        avatar: 'https://example.com/avatar.jpg',
      },
      logout: jest.fn(),
      hasPermission: jest.fn((permissions) => {
        // 只允许访问仪表盘和用户管理
        return permissions.includes('menu:dashboard:view') ||
               permissions.includes('menu:system:user:view');
      }),
    });

    render(
      <EnhancedSidebar
        isCollapsed={false}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    // 应该显示有权限的菜单项
    expect(screen.getByText('仪表盘')).toBeInTheDocument();
    expect(screen.getByText('用户管理')).toBeInTheDocument();

    // 不应该显示没有权限的菜单项
    expect(screen.queryByText('角色管理')).not.toBeInTheDocument();
    expect(screen.queryByText('权限管理')).not.toBeInTheDocument();
    expect(screen.queryByText('OAuth 客户端')).not.toBeInTheDocument();
    expect(screen.queryByText('审计日志')).not.toBeInTheDocument();
    expect(screen.queryByText('系统配置')).not.toBeInTheDocument();
  });

  it('高亮当前活动菜单项', () => {
    const { usePathname } = require('next/navigation');
    usePathname.mockReturnValue('/admin/users');

    render(
      <EnhancedSidebar
        isCollapsed={false}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    // 用户管理菜单项应该被高亮
    const userManagementItem = screen.getByText('用户管理').closest('a');
    expect(userManagementItem).toHaveAttribute('aria-current', 'page');
  });

  it('折叠状态下显示工具提示', () => {
    render(
      <EnhancedSidebar
        isCollapsed={true}
        onToggleCollapse={mockToggleCollapse}
      />
    );

    // 在折叠状态下，菜单项文字应该通过工具提示显示
    // 注意：工具提示在hover时显示，这里我们只验证结构
    const menuLinks = screen.getAllByRole('link');
    expect(menuLinks.length).toBeGreaterThan(0);
  });
});